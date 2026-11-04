import * as THREE from 'three';
import { eventsBetween, progressAt } from '../../sim/playback.ts';
import type { BoxSpot, HorseId, RaceEvent, Timeline } from '../../sim/types.ts';
import { ITEM_INFO, popupOf } from '../items.ts';
import { BOX_COLOR } from '../palette.ts';
import {
  BOX_REVEAL,
  COAST_SPEED,
  ITEM_HOLD_SECONDS,
  POPUP_SECONDS,
  TRAIL,
  defaultColors,
  type ColorsOf,
} from '../Pixel2DRenderer.ts';
import type { RaceRenderer } from '../renderer.ts';
import { drawNumber, poseOf } from '../sprites.ts';
import { horsePoint, type Track } from '../track.ts';
import { CONFETTI, CONFETTI_SECONDS, MOTES, confettiAt, moteAt } from './ambient.ts';
import { PARTICLES, activeAt, effectsOf, particlesOf, type Effect } from './effects.ts';
import { presetById, presetOf, type Preset, type PresetId } from './lighting.ts';
import { FOV_DEG, easeFor, PIXEL_M, TILT_BLUR_PX } from './look.ts';
import { buildPost, type Post } from './post.ts';
import { buildWorld, cutoutMaterials, disposeTree, type World } from './scene.ts';
import { CELL, cellOf, cellUv, drawSheet, sheetSize } from './sheet.ts';
import { cameraPosition, shotAt, type Shot } from './shots.ts';

export interface HD2DOptions {
  /** Called once if the WebGL context is lost or a frame failed; RaceView swaps to 2D. */
  onLost?: () => void;
  /** Look test: hold race time here instead of following the clock. */
  freezeT?: number;
  /** Look test / sandbox: force a lighting preset. */
  preset?: PresetId;
}

interface HorseView {
  readonly horse: HorseId;
  readonly lane: number;
  readonly mesh: THREE.Mesh;
  readonly map: THREE.Texture;
}

/** At most this many effects draw at once (12 particles each). */
const MAX_FX = 64;

export class HD2DRenderer implements RaceRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly colors: ColorsOf;
  private readonly opts: HD2DOptions;
  private raf = 0;
  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private post: Post | null = null;
  private world: World | null = null;
  private sheet: THREE.CanvasTexture | null = null;
  private horses: HorseView[] = [];
  private sun: THREE.DirectionalLight | null = null;
  private fog: THREE.Fog | null = null;
  private readonly p = new THREE.Vector3();
  private readonly q = new THREE.Vector3();
  private shot: Shot | null = null;
  private boxes: (readonly BoxSpot[])[] = [];
  private grabs: number[][] = [];
  private boxAt: number[][] = [];
  private held: Extract<RaceEvent, { type: 'pickup' }>[] = [];
  private boxMesh: THREE.InstancedMesh | null = null;
  private badges: THREE.Sprite[] = [];
  private labels: THREE.Sprite[] = [];
  private readonly textCache = new Map<string, THREE.CanvasTexture>();
  private trails: { dust: THREE.Points; sparkle: THREE.Points } | null = null;
  private effects: Effect[] = [];
  private fxPoints: THREE.Points | null = null;
  private readonly fxCol = new THREE.Color();
  private readonly tint = new THREE.Color();
  private motes: THREE.Points | null = null;
  private confetti: THREE.Points | null = null;
  private hud: {
    scene: THREE.Scene;
    camera: THREE.OrthographicCamera;
    sprite: THREE.Sprite;
  } | null = null;
  private readonly where = new Map<HorseId, THREE.Vector3>();
  private readonly mtx = new THREE.Matrix4();
  private readonly rot = new THREE.Quaternion();
  private readonly one = new THREE.Vector3(1, 1, 1);
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly col = new THREE.Color();
  private motion = true;
  private lastW = 0;
  private lastH = 0;
  private preset: Preset | null = null;
  private resize: ResizeObserver | null = null;
  private readonly lost = (e: Event) => {
    e.preventDefault();
    this.stop();
    this.opts.onLost?.();
  };

  constructor(canvas: HTMLCanvasElement, colors: ColorsOf = defaultColors, opts: HD2DOptions = {}) {
    this.canvas = canvas;
    this.colors = colors;
    this.opts = opts;
  }

  play(timeline: Timeline, track: Track, startAtMs: number) {
    this.stop();
    const lanes = timeline.horses.length;
    const preset = this.opts.preset ? presetById(this.opts.preset) : presetOf(timeline.seed);
    this.preset = preset;

    const renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: false,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(1);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer = renderer;
    this.canvas.addEventListener('webglcontextlost', this.lost);

    const scene = new THREE.Scene();
    this.scene = scene;
    const world = buildWorld(track, lanes, timeline.seed, preset);
    this.world = world;
    scene.add(world.group);
    scene.background = world.sky;
    this.fog = scene.fog = new THREE.Fog(preset.fog, 100, 400);
    scene.add(
      new THREE.HemisphereLight(preset.hemi.sky, preset.hemi.ground, preset.hemi.intensity),
    );
    const sun = new THREE.DirectionalLight(preset.sun.color, preset.sun.intensity);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.bias = -0.0005;
    const cam = sun.shadow.camera;
    cam.near = 1; // the frustum is sized per shot kind in draw()
    scene.add(sun, sun.target);
    this.sun = sun;

    // One sprite sheet for every lane; each horse gets a texture view with its own UV window.
    const { width, height } = sheetSize(lanes);
    const sheetCanvas = document.createElement('canvas');
    sheetCanvas.width = width;
    sheetCanvas.height = height;
    const sheetCtx = sheetCanvas.getContext('2d');
    if (!sheetCtx) throw new Error('2D canvas context unavailable');
    drawSheet(
      sheetCtx,
      timeline.horses.map((h, lane) => this.colors(h, lane)),
    );
    const sheet = new THREE.CanvasTexture(sheetCanvas);
    sheet.magFilter = THREE.NearestFilter;
    sheet.minFilter = THREE.NearestFilter;
    sheet.generateMipmaps = false;
    sheet.colorSpace = THREE.SRGBColorSpace;
    this.sheet = sheet;
    const geo = new THREE.PlaneGeometry(CELL.w * PIXEL_M, CELL.h * PIXEL_M);
    geo.translate(0, (CELL.footY - CELL.h / 2) * PIXEL_M, 0);
    this.horses = timeline.horses.map((horse, lane) => {
      const map = sheet.clone();
      const { material, depth } = cutoutMaterials(map);
      const mesh = new THREE.Mesh(geo, material);
      mesh.customDepthMaterial = depth;
      mesh.castShadow = true;
      scene.add(mesh);
      return { horse, lane, mesh, map };
    });

    // Boxes: glowing cubes (colour x 2 so bloom catches them).
    this.cacheBoxes(timeline);
    const boxCount = Math.max(
      1,
      this.boxes.reduce((n, b) => n + b.length, 0),
    );
    const boxMesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.6, 0.6, 0.6),
      new THREE.MeshBasicMaterial(),
      boxCount,
    );
    boxMesh.count = 0;
    scene.add(boxMesh);
    this.boxMesh = boxMesh;

    // Number badges (lane + 1, saddle-cloth style) drawn with the 2D code.
    this.badges = timeline.horses.map((h, lane) => {
      const n = String(lane + 1);
      const c = document.createElement('canvas');
      c.width = n.length * 4 + 3;
      c.height = 9;
      drawNumber(
        c.getContext('2d')!,
        Math.ceil((n.length * 4 + 1) / 2) + 1,
        8,
        lane + 1,
        this.colors(h, lane).silk,
      );
      const tex = new THREE.CanvasTexture(c);
      tex.magFilter = tex.minFilter = THREE.NearestFilter;
      tex.generateMipmaps = false;
      tex.colorSpace = THREE.SRGBColorSpace;
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex }));
      sprite.scale.set(c.width * PIXEL_M, c.height * PIXEL_M, 1);
      sprite.center.set(0.5, 0);
      scene.add(sprite);
      return sprite;
    });

    // A pool of text sprites for held items and popups, always on top.
    this.labels = Array.from({ length: 48 }, () => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ depthTest: false }));
      s.renderOrder = 10;
      s.center.set(0.5, 0);
      s.visible = false;
      scene.add(s);
      return s;
    });

    // Trails: past positions from the timeline itself (no ring buffer needed).
    const trailGeo = () => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(lanes * TRAIL * 3), 3));
      return g;
    };
    this.trails = {
      dust: new THREE.Points(
        trailGeo(),
        new THREE.PointsMaterial({ color: '#a39382', size: 0.35, transparent: true, opacity: 0.6 }),
      ),
      sparkle: new THREE.Points(
        trailGeo(),
        new THREE.PointsMaterial({
          color: new THREE.Color('#ffd54f').multiplyScalar(2),
          size: 0.25,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      ),
    };
    scene.add(this.trails.dust, this.trails.sparkle);

    this.effects = effectsOf(timeline.events);
    const fxGeo = new THREE.BufferGeometry();
    const fxN = MAX_FX * PARTICLES;
    fxGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(fxN * 3), 3));
    fxGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(fxN * 3), 3));
    this.fxPoints = new THREE.Points(
      fxGeo,
      new THREE.PointsMaterial({
        size: 0.6,
        vertexColors: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    scene.add(this.fxPoints);

    const pointsOf = (n: number, material: THREE.PointsMaterial) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      const pts = new THREE.Points(g, material);
      scene.add(pts);
      return pts;
    };
    this.motes = pointsOf(
      MOTES,
      new THREE.PointsMaterial({
        size: preset.motes === 'fireflies' ? 0.5 : 0.3,
        vertexColors: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.confetti = pointsOf(CONFETTI, new THREE.PointsMaterial({ size: 0.3, vertexColors: true }));
    if (preset.floodlights) {
      // Warm fill over the home straight so night sprites pick up floodlight colour.
      for (const x of [-60, 60]) {
        const fill = new THREE.PointLight('#ffe9b0', 1.2, 0, 0);
        fill.position.set(x, 25, world.finishTop.z - 10);
        scene.add(fill);
      }
    }

    // Countdown / GO! in a screen-space overlay drawn after the post stack.
    const hudScene = new THREE.Scene();
    const hudSprite = new THREE.Sprite(new THREE.SpriteMaterial({ depthTest: false }));
    hudSprite.scale.set(8, 2, 1);
    hudScene.add(hudSprite);
    this.hud = {
      scene: hudScene,
      camera: new THREE.OrthographicCamera(-8, 8, 4.5, -4.5, 0, 10),
      sprite: hudSprite,
    };

    const camera = new THREE.PerspectiveCamera(FOV_DEG, 16 / 9, 1, 3000);
    this.camera = camera;
    this.post = buildPost(renderer, scene, camera, preset);

    const fit = () => {
      const w = Math.min(1920, Math.max(1, this.canvas.clientWidth));
      const h = Math.max(1, Math.round((w * 9) / 16));
      if (w === this.lastW && h === this.lastH) return;
      this.lastW = w;
      this.lastH = h;
      renderer.setSize(w, h, false);
      this.post?.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    fit();
    this.resize = new ResizeObserver(fit);
    this.resize.observe(this.canvas);

    this.shot = null;
    this.motion = !(
      typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
    );

    let last = performance.now();
    const frame = () => {
      const now = performance.now();
      if (import.meta.env.DEV) {
        // Dev-only readout for /sandbox (spec §4 performance target).
        const g = globalThis as { hd2dFrameMs?: number };
        g.hd2dFrameMs = (g.hd2dFrameMs ?? 16) * 0.9 + (now - last) * 0.1;
      }
      const dt = Math.min(0.25, Math.max(0, (now - last) / 1000));
      last = now;
      const t = this.opts.freezeT ?? (Date.now() - startAtMs) / 1000;
      try {
        this.draw(timeline, track, t, dt);
      } catch (e) {
        console.error(e);
        this.stop();
        this.opts.onLost?.();
        return;
      }
      this.raf = requestAnimationFrame(frame);
    };
    frame();
  }

  /** A cached canvas texture of outlined white text (popups, icons, countdown). */
  private text(label: string): THREE.CanvasTexture {
    let tex = this.textCache.get(label);
    if (tex) return tex;
    const c = document.createElement('canvas');
    const ctx = c.getContext('2d')!;
    const font = '40px "Pixelify Sans", sans-serif';
    ctx.font = font;
    c.width = Math.ceil(ctx.measureText(label).width) + 24; // resets the context state
    c.height = 64;
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 8;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#000';
    ctx.strokeText(label, c.width / 2, 34);
    ctx.fillStyle = '#fff';
    ctx.fillText(label, c.width / 2, 34);
    tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.textCache.set(label, tex);
    return tex;
  }

  /** Box display rules, the same as the 2D renderer's play(). */
  private cacheBoxes(timeline: Timeline) {
    this.boxes = timeline.horses.map((h) =>
      [...(timeline.boxes[h] ?? [])].sort((a, b) => a.at - b.at),
    );
    this.held = timeline.events.filter((e) => e.type === 'pickup');
    this.grabs = timeline.horses.map((h) =>
      this.held
        .filter((e) => e.horse === h)
        .map((e) => e.t - ITEM_HOLD_SECONDS)
        .sort((a, b) => a - b),
    );
    this.boxAt = this.boxes.map((boxes, lane) =>
      boxes.map((box, i) => {
        const grab = this.grabs[lane]![i];
        return grab === undefined ? box.at : progressAt(timeline, timeline.horses[lane]!, grab);
      }),
    );
  }

  /** Metres along the race, coasting past the line after the finish (display only). */
  private metres(timeline: Timeline, horse: HorseId, t: number) {
    const finished = timeline.finishTimes[horse] ?? Infinity;
    return progressAt(timeline, horse, t) + Math.max(0, t - finished) * COAST_SPEED;
  }

  private draw(timeline: Timeline, track: Track, t: number, dt: number) {
    const { camera, post, sun, world, preset, fog } = this;
    if (!camera || !post || !sun || !world || !preset || !fog) return;
    const d = timeline.distance;

    // Hard cut when the shot kind changes; ease toward the target within a shot.
    const want = shotAt(track, timeline, t, this.motion);
    const prev = this.shot;
    const k = this.motion ? easeFor(dt) : 1;
    const shot: Shot =
      !prev || prev.kind !== want.kind
        ? want
        : {
            ...want,
            x: prev.x + (want.x - prev.x) * k,
            y: prev.y + (want.y - prev.y) * k,
            yaw:
              prev.yaw +
              Math.atan2(Math.sin(want.yaw - prev.yaw), Math.cos(want.yaw - prev.yaw)) * k,
          };
    this.shot = shot;
    const pos = cameraPosition(shot);
    camera.position.set(pos.x, pos.y, pos.z);
    camera.lookAt(shot.x, 0, shot.y);
    post.setTilt(TILT_BLUR_PX[shot.kind]);
    fog.near = shot.distance * 1.2;
    fog.far = shot.distance * 4;
    const tx = shot.x;
    const ty = shot.y;
    const yaw = shot.yaw;
    if (shot.kind !== prev?.kind) {
      const half = shot.kind === 'wide' ? 450 : 60;
      const cam = sun.shadow.camera;
      cam.left = cam.bottom = -half;
      cam.right = cam.top = half;
      cam.far = shot.kind === 'wide' ? 1200 : 500;
      cam.updateProjectionMatrix();
    }

    // Sun shadows follow the camera target.
    const [fx, fy, fz] = preset.sun.from;
    sun.target.position.set(tx, 0, ty);
    sun.position.set(tx + fx * 200, fy * 200, ty + fz * 200);
    // Everything flat faces the camera's yaw (parallel billboards).
    for (const o of world.billboards) o.rotation.y = yaw;

    // Horses: position, facing, pose and gallop frame.
    const { p, q, where } = this;
    where.clear();
    for (const v of this.horses) {
      const m = this.metres(timeline, v.horse, t);
      const here = horsePoint(track, d, m, v.lane);
      const ahead = horsePoint(track, d, m + 1, v.lane);
      v.mesh.position.set(here.x, 0, here.y);
      where.set(v.horse, v.mesh.position);
      this.badges[v.lane]?.position.set(here.x, 20 * PIXEL_M, here.y);
      v.mesh.rotation.y = yaw;
      p.set(here.x, 0, here.y).project(camera);
      q.set(ahead.x, 0, ahead.y).project(camera);
      const pose = poseOf(q.x - p.x, -(q.y - p.y));
      const uv = cellUv(timeline.horses.length, cellOf(v.lane, pose, Math.floor(m / 1.5)));
      v.map.offset.set(uv.offsetX, uv.offsetY);
      v.map.repeat.set(uv.repeatX, uv.repeatY);
    }

    // Unopened boxes: only near their own horse, at the spot the horse grabs them.
    const box = this.boxMesh!;
    const { mtx, one, col } = this;
    const rot = this.rot.setFromAxisAngle(this.up, t * 2);
    let n = 0;
    timeline.horses.forEach((horse, lane) => {
      const boxes = this.boxes[lane] ?? [];
      const reach = progressAt(timeline, horse, t) + d * BOX_REVEAL;
      const grabs = this.grabs[lane] ?? [];
      for (let i = grabs.filter((g) => g <= t).length; i < boxes.length; i++) {
        const at = this.boxAt[lane]![i]!;
        if (at > reach) break;
        const bp = horsePoint(track, d, at, lane);
        const bob = this.motion ? Math.sin(t * 3 + i) * 0.15 : 0;
        mtx.compose(p.set(bp.x, 0.7 + bob, bp.y), rot, one);
        box.setMatrixAt(n, mtx);
        box.setColorAt(n, col.set(BOX_COLOR[boxes[i]!.kind]).multiplyScalar(2));
        n++;
      }
    });
    box.count = n;
    box.instanceMatrix.needsUpdate = true;
    if (box.instanceColor) box.instanceColor.needsUpdate = true;

    // Held items spin over their horse; popups float up.
    let used = 0;
    const show = (label: string, x: number, y: number, z: number, spin: number) => {
      const s = this.labels[used++];
      if (!s) return;
      const tex = this.text(label);
      s.material.map = tex;
      s.material.needsUpdate = true;
      s.position.set(x, y, z);
      const w = (tex.image as HTMLCanvasElement).width;
      s.scale.set(w * PIXEL_M * 0.25 * spin, 64 * PIXEL_M * 0.25, 1);
      s.visible = true;
    };
    for (const e of this.held) {
      if (t < e.t - ITEM_HOLD_SECONDS || t >= e.t) continue;
      const at = where.get(e.horse);
      if (!at) continue;
      const icon = e.item ? ITEM_INFO[e.item].icon : '\u{1F4A8}';
      const spin = this.motion ? Math.abs(Math.cos(t * 2 * Math.PI * 1.5)) || 0.05 : 1;
      show(icon, at.x, 4.2 + (this.motion ? Math.sin(t * 8) * 0.2 : 0), at.z, spin);
    }
    for (const e of eventsBetween(timeline, t - POPUP_SECONDS, t)) {
      const at = where.get(e.horse);
      if (at) show(popupOf(e), at.x, 5 + (t - e.t) * 1.2, at.z, 1);
    }
    for (let i = used; i < this.labels.length; i++) this.labels[i]!.visible = false;

    // Trails from the horse's own past positions.
    if (this.trails) {
      const fill = (points: THREE.Points, kind: string, lift: (i: number) => number) => {
        const arr = points.geometry.getAttribute('position') as THREE.BufferAttribute;
        let k = 0;
        timeline.horses.forEach((horse, lane) => {
          if (this.colors(horse, lane).trail !== kind) return;
          const finished = timeline.finishTimes[horse] ?? Infinity;
          if (t <= 0 || t >= finished) return;
          for (let i = 1; i <= TRAIL; i++) {
            const m = progressAt(timeline, horse, Math.max(0, t - i * 0.08));
            const tp = horsePoint(track, d, m, lane);
            arr.setXYZ(k++, tp.x, lift(i), tp.y);
          }
        });
        points.geometry.setDrawRange(0, k);
        arr.needsUpdate = true;
      };
      fill(this.trails.dust, 'trail:dust', () => 0.15);
      fill(this.trails.sparkle, 'trail:sparkle', (i) => 1.5 + (i % 3) * 0.3);
    }

    // Item effects: pure particles in each horse's running frame.
    if (this.fxPoints) {
      const pos = this.fxPoints.geometry.getAttribute('position') as THREE.BufferAttribute;
      const colAttr = this.fxPoints.geometry.getAttribute('color') as THREE.BufferAttribute;
      const c = this.fxCol;
      let k = 0;
      for (const { effect, age } of activeAt(this.effects, t).slice(0, MAX_FX)) {
        const lane = timeline.horses.indexOf(effect.horse);
        if (lane < 0) continue;
        // The box puff stays where the box was grabbed; others ride with the horse.
        const m =
          effect.kind === 'box'
            ? progressAt(timeline, effect.horse, effect.t0)
            : this.metres(timeline, effect.horse, t);
        const here = horsePoint(track, d, m, lane);
        const next = horsePoint(track, d, m + 1, lane);
        const len = Math.hypot(next.x - here.x, next.y - here.y) || 1;
        const ax = (next.x - here.x) / len;
        const az = (next.y - here.y) / len;
        for (const pt of particlesOf(effect.kind, age)) {
          pos.setXYZ(
            k,
            here.x + ax * pt.ahead - az * pt.side,
            pt.up,
            here.y + az * pt.ahead + ax * pt.side,
          );
          c.set(pt.color).multiplyScalar(pt.alpha * 2.5);
          colAttr.setXYZ(k, c.r, c.g, c.b);
          k++;
        }
      }
      this.fxPoints.geometry.setDrawRange(0, k);
      pos.needsUpdate = true;
      colAttr.needsUpdate = true;
    }

    // Crowd bob in whole texels; motes near the action; confetti after the first finish.
    world.crowd.forEach((row, i) => {
      const bob = this.motion ? Math.round(Math.sin(t * 6 + i * 1.3)) * PIXEL_M : 0;
      row.position.y = (row.userData.baseY as number) + bob;
    });
    const tint = this.tint;
    if (this.motes) {
      const pos = this.motes.geometry.getAttribute('position') as THREE.BufferAttribute;
      const colAttr = this.motes.geometry.getAttribute('color') as THREE.BufferAttribute;
      const hex = preset.motes === 'fireflies' ? '#d4ff6a' : '#fff3c4';
      for (let i = 0; i < MOTES; i++) {
        const mo = moteAt(this.motion ? t : 0, preset.motes, i);
        pos.setXYZ(i, tx + mo.x, mo.y, ty + mo.z);
        tint.set(hex).multiplyScalar(mo.alpha * 2.5);
        colAttr.setXYZ(i, tint.r, tint.g, tint.b);
      }
      pos.needsUpdate = true;
      colAttr.needsUpdate = true;
    }
    if (this.confetti) {
      const age = t - Math.min(...Object.values(timeline.finishTimes));
      const visible = age >= 0 && age < CONFETTI_SECONDS;
      this.confetti.visible = visible;
      if (visible) {
        const pos = this.confetti.geometry.getAttribute('position') as THREE.BufferAttribute;
        const colAttr = this.confetti.geometry.getAttribute('color') as THREE.BufferAttribute;
        const top = world.finishTop;
        for (let i = 0; i < CONFETTI; i++) {
          const cp = confettiAt(age, i);
          pos.setXYZ(i, top.x + cp.x, top.y + cp.y, top.z + cp.z);
          tint.set(cp.color).multiplyScalar(cp.alpha);
          colAttr.setXYZ(i, tint.r, tint.g, tint.b);
        }
        pos.needsUpdate = true;
        colAttr.needsUpdate = true;
      }
    }

    post.composer.render();
    // Countdown, then GO!, over the post stack.
    if (t < 1 && this.hud && this.renderer) {
      const tex = this.text(t < 0 ? String(Math.ceil(-t)) : 'GO!');
      this.hud.sprite.material.map = tex;
      this.hud.sprite.material.needsUpdate = true;
      // 8 world units per 256 px, as before the canvas became variable.
      this.hud.sprite.scale.set(((tex.image as HTMLCanvasElement).width * 8) / 256, 2, 1);
      this.renderer.autoClear = false;
      this.renderer.clearDepth();
      this.renderer.render(this.hud.scene, this.hud.camera);
      this.renderer.autoClear = true;
    }
  }

  stop() {
    cancelAnimationFrame(this.raf);
    this.resize?.disconnect();
    this.resize = null;
    this.canvas.removeEventListener('webglcontextlost', this.lost);
    for (const tex of this.textCache.values()) tex.dispose();
    this.textCache.clear();
    if (this.hud) disposeTree(this.hud.scene);
    this.hud = null;
    this.boxMesh = null;
    this.trails = null;
    this.fxPoints = null;
    this.motes = null;
    this.confetti = null;
    this.effects = [];
    this.badges = [];
    this.labels = [];
    if (this.scene) disposeTree(this.scene);
    this.world?.sky.dispose();
    this.sheet?.dispose();
    for (const v of this.horses) v.map.dispose();
    this.post?.dispose();
    this.renderer?.dispose();
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.post = null;
    this.world = null;
    this.sheet = null;
    this.sun?.dispose();
    this.sun = null;
    this.fog = null;
    this.shot = null;
    this.lastW = this.lastH = 0;
    this.preset = null;
    this.horses = [];
  }
}
