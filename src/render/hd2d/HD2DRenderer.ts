import * as THREE from 'three';
import { WEATHER } from '../../sim/config.ts';
import { eventsBetween, progressAt } from '../../sim/playback.ts';
import type { BoxSpot, HorseId, RaceEvent, Timeline, Weather } from '../../sim/types.ts';
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
import { TRAIL_STYLES, type TrailStyle } from '../trails.ts';
import { FOG, RAIN, puddleOutline, rainDrop } from '../weatherFx.ts';
import { CONFETTI, CONFETTI_SECONDS, MOTES, confettiAt, moteAt } from './ambient.ts';
import {
  PARTICLES,
  SPECIAL_KINDS,
  SPECIAL_PARTICLES,
  activeAt,
  durationOf,
  effectsOf,
  particlesOf,
  type Effect,
} from './effects.ts';
import { presetById, presetOf, type Preset, type PresetId } from './lighting.ts';
import { FOV_DEG, RENDER_MAX_WIDTH, easeFor, PIXEL_M, TILT_BLUR_PX } from './look.ts';
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

/** At most this many effects draw at once (12 particles each); room for a 22-horse Thunderclap. */
const MAX_FX = 96;
/** Stampede ghost horses: this many behind each stampeding horse, for up to 2 at once. */
const GHOSTS_EACH = 3;
const GHOST_GAP_M = 3;
const GHOST_POOL = 2 * GHOSTS_EACH;
/** Puddle stencil value; horses write 0 over it so a reflection never paints over a horse. */
const PUDDLE_STENCIL = 1;

/** Parsed trail colours: THREE.Color parses a string on every set, and trails reuse a handful. */
const trailColors = new Map<string, THREE.Color>();
function trailColor(hex: string) {
  let c = trailColors.get(hex);
  if (!c) trailColors.set(hex, (c = new THREE.Color(hex)));
  return c;
}
type TrailCloud = {
  style: TrailStyle;
  points: THREE.Points;
  pos: THREE.BufferAttribute;
  col: THREE.BufferAttribute;
  n: number;
};

export class HD2DRenderer implements RaceRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly colors: ColorsOf;
  private readonly opts: HD2DOptions;
  private raf = 0;
  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene | null = null;
  /** Badges and labels: drawn after the post stack so they never bloom or tone-map. */
  private overlay: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private post: Post | null = null;
  private world: World | null = null;
  private sheet: THREE.CanvasTexture | null = null;
  private horses: HorseView[] = [];
  private ghosts: {
    mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
    map: THREE.Texture;
  }[] = [];
  private weather: Weather = 'clear';
  /** Per lane: its puddles' [from, to] metres, so a reflection shows only near water. */
  private wet: [number, number][][] = [];
  private reflections: {
    mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
    map: THREE.Texture;
  }[] = [];
  private rain: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial> | null = null;
  private sun: THREE.DirectionalLight | null = null;
  private fog: THREE.Fog | null = null;
  private readonly p = new THREE.Vector3();
  private readonly q = new THREE.Vector3();
  private shot: Shot | null = null;
  private tilt = 0;
  private shadowHalf = 0;
  private boxes: (readonly BoxSpot[])[] = [];
  private grabs: number[][] = [];
  private boxAt: number[][] = [];
  private held: Extract<RaceEvent, { type: 'pickup' }>[] = [];
  private boxMesh: THREE.InstancedMesh | null = null;
  private badges: THREE.Sprite[] = [];
  private labels: THREE.Sprite[] = [];
  private readonly textCache = new Map<string, THREE.CanvasTexture>();
  private readonly trails = new Map<string, TrailCloud>();
  private effects: Effect[] = [];
  private fxPoints: THREE.Points | null = null;
  private fxBig: THREE.Points | null = null;
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
    this.weather = timeline.weather ?? 'clear';
    this.motion = !(
      typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
    );

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
    // Fog races fade the sky toward the fog colour too, so the horizon has no seam.
    const fogSky = (c: string) =>
      `#${new THREE.Color(c).lerp(new THREE.Color(FOG.color), FOG.mix).getHexString()}`;
    const world = buildWorld(
      track,
      lanes,
      timeline.seed,
      this.weather === 'fog'
        ? { ...preset, sky: [fogSky(preset.sky[0]), fogSky(preset.sky[1])] }
        : preset,
    );
    this.world = world;
    scene.add(world.group);
    scene.background = world.sky;
    const fogColor = new THREE.Color(preset.fog);
    if (this.weather === 'fog') fogColor.lerp(new THREE.Color(FOG.color), FOG.mix);
    this.fog = scene.fog = new THREE.Fog(fogColor, 100, 400);
    scene.add(
      new THREE.HemisphereLight(preset.hemi.sky, preset.hemi.ground, preset.hemi.intensity),
    );
    const sun = new THREE.DirectionalLight(preset.sun.color, preset.sun.intensity);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.bias = -0.0005;
    const cam = sun.shadow.camera;
    cam.near = 1; // the frustum follows the shot distance in draw()
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
      if (this.weather === 'rain') {
        // Horses clear the puddle mark where they stand (alphaTest texels write nothing).
        material.stencilWrite = true;
        material.stencilRef = 0;
        material.stencilFunc = THREE.AlwaysStencilFunc;
        material.stencilZPass = THREE.ReplaceStencilOp;
      }
      const mesh = new THREE.Mesh(geo, material);
      mesh.renderOrder = 2; // after the puddles (the opaque pass sorts by renderOrder)
      mesh.customDepthMaterial = depth;
      mesh.castShadow = true;
      scene.add(mesh);
      return { horse, lane, mesh, map };
    });
    // Faded copies that run behind a Stampede (no shadow, no depth write).
    this.ghosts = Array.from({ length: GHOST_POOL }, () => {
      const map = sheet.clone();
      const mesh = new THREE.Mesh(
        geo,
        new THREE.MeshBasicMaterial({
          map,
          color: '#fff3c4',
          transparent: true,
          opacity: 0.35,
          // alphaTest compares texel alpha x opacity: keep it under the ghosts' faded opacity.
          alphaTest: 0.02,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      );
      mesh.visible = false;
      scene.add(mesh);
      return { mesh, map };
    });

    // Rain puddles: dark glossy water that marks the stencil for reflections.
    this.wet = timeline.horses.map(() => []);
    for (const pd of timeline.puddles ?? []) {
      const ring = puddleOutline(track, timeline.distance, pd);
      const pg = new THREE.ShapeGeometry(
        new THREE.Shape(ring.map((pt) => new THREE.Vector2(pt.x, pt.y))),
      );
      pg.rotateX(Math.PI / 2); // (x, y, 0) -> (x, 0, y): lies on the track
      const water = new THREE.Mesh(
        pg,
        new THREE.MeshStandardMaterial({
          // No env map, so any metalness reads as black; a lit slate-blue with a small
          // self-lift reads as water, not a pit, in every preset.
          color: '#6d8494',
          emissive: '#2a3a46',
          roughness: 0.2,
          metalness: 0,
          side: THREE.DoubleSide,
          stencilWrite: true,
          stencilRef: PUDDLE_STENCIL,
          stencilFunc: THREE.AlwaysStencilFunc,
          stencilZPass: THREE.ReplaceStencilOp,
          polygonOffset: true,
          polygonOffsetFactor: -1,
          polygonOffsetUnits: -4,
        }),
      );
      water.position.y = 0.04; // above the dirt strip (0.02)
      water.renderOrder = 1;
      water.receiveShadow = true;
      scene.add(water);
      for (let lane = pd.lanes[0]; lane <= pd.lanes[1]; lane++) {
        this.wet[lane]?.push([pd.at - 1, pd.at + WEATHER.puddleLengthM + 1]);
      }
    }
    // One upside-down copy per horse, drawn only where a puddle marked the stencil.
    this.reflections =
      this.weather === 'rain'
        ? timeline.horses.map(() => {
            const map = sheet.clone();
            const mesh = new THREE.Mesh(
              geo,
              new THREE.MeshBasicMaterial({
                map,
                color: '#9fc3e0',
                transparent: true,
                opacity: 0.4,
                alphaTest: 0.02,
                depthTest: false,
                depthWrite: false,
                side: THREE.DoubleSide,
                stencilWrite: true, // three only applies stencilFunc when this is on
                stencilRef: PUDDLE_STENCIL,
                stencilFunc: THREE.EqualStencilFunc,
                stencilZPass: THREE.KeepStencilOp,
              }),
            );
            mesh.scale.y = -1;
            // First in the transparent pass, so rain, ghosts and splashes draw over it.
            mesh.renderOrder = -1;
            mesh.visible = false;
            scene.add(mesh);
            return { mesh, map };
          })
        : [];

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
    boxMesh.frustumCulled = false; // matrices change every frame; the cached bounds go stale
    scene.add(boxMesh);
    this.boxMesh = boxMesh;

    const overlay = new THREE.Scene();
    this.overlay = overlay;

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
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, toneMapped: false }));
      sprite.scale.set(c.width * PIXEL_M, c.height * PIXEL_M, 1);
      sprite.center.set(0.5, 0);
      overlay.add(sprite);
      return sprite;
    });

    // A pool of text sprites for held items and popups, always on top.
    this.labels = Array.from({ length: 2 * lanes + 8 }, () => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ depthTest: false, toneMapped: false }));
      s.renderOrder = 10;
      s.center.set(0.5, 0);
      s.visible = false;
      overlay.add(s);
      return s;
    });

    // Trails: past positions from the timeline itself (no ring buffer needed). One cloud per trail
    // somebody in this race wears, so unworn trails cost nothing per frame.
    this.trails.clear();
    for (const code of new Set(timeline.horses.map((h, lane) => this.colors(h, lane).trail))) {
      const style = code ? TRAIL_STYLES[code] : undefined;
      if (!code || !style) continue;
      const g = new THREE.BufferGeometry();
      const pos = new THREE.BufferAttribute(new Float32Array(lanes * TRAIL * 3), 3);
      const col = new THREE.BufferAttribute(new Float32Array(lanes * TRAIL * 3), 3);
      g.setAttribute('position', pos);
      g.setAttribute('color', col);
      const k = style.hd.glow ? 2 : 1; // over 1, so the bloom pass catches glowing trails
      const points = new THREE.Points(
        g,
        new THREE.PointsMaterial({
          size: style.hd.size,
          vertexColors: true,
          color: new THREE.Color(k, k, k),
          transparent: true,
          opacity: style.hd.opacity,
          ...(style.hd.glow ? { blending: THREE.AdditiveBlending, depthWrite: false } : {}),
        }),
      );
      points.frustumCulled = false;
      scene.add(points);
      this.trails.set(code, { style, points, pos, col, n: 0 });
    }

    this.effects = effectsOf(timeline.events, timeline.hot);
    // Two clouds: ordinary effects, and the special items drawn bigger (spec 2026-11-05).
    const cloud = (n: number, size: number) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      const pts = new THREE.Points(
        g,
        new THREE.PointsMaterial({
          size,
          vertexColors: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      pts.frustumCulled = false;
      scene.add(pts);
      return pts;
    };
    this.fxPoints = cloud(MAX_FX * PARTICLES, 0.6);
    this.fxBig = cloud(MAX_FX * SPECIAL_PARTICLES, 1.1);

    const pointsOf = (n: number, material: THREE.PointsMaterial) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      const pts = new THREE.Points(g, material);
      pts.frustumCulled = false;
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
    if (this.weather === 'rain' && this.motion) {
      const rg = new THREE.BufferGeometry();
      rg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(RAIN.drops * 6), 3));
      this.rain = new THREE.LineSegments(
        rg,
        new THREE.LineBasicMaterial({
          color: '#dfe9f3',
          transparent: true,
          opacity: 0.35,
          depthWrite: false,
        }),
      );
      this.rain.frustumCulled = false;
      scene.add(this.rain);
    }
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
    const hudSprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ depthTest: false, toneMapped: false }),
    );
    hudSprite.scale.set(8, 2, 1);
    hudScene.add(hudSprite);
    this.hud = {
      scene: hudScene,
      camera: new THREE.OrthographicCamera(-8, 8, 4.5, -4.5, 0, 10),
      sprite: hudSprite,
    };

    const camera = new THREE.PerspectiveCamera(FOV_DEG, 16 / 9, 1, 3000);
    this.camera = camera;
    this.post = buildPost(
      renderer,
      scene,
      camera,
      preset,
      this.weather === 'rain'
        ? { tint: RAIN.tint, saturation: RAIN.saturation, stencil: true }
        : undefined,
    );

    const fit = () => {
      const w = Math.min(RENDER_MAX_WIDTH, Math.max(1, this.canvas.clientWidth));
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
    this.tilt = TILT_BLUR_PX.wide; // every race opens on the wide shot
    this.shadowHalf = 0;

    // Text drawn before the webfont arrives keeps the fallback font; redraw once it loads.
    document.fonts
      ?.load('40px "Pixelify Sans"')
      .then(() => {
        if (this.renderer !== renderer) return; // stopped or restarted meanwhile
        for (const tex of this.textCache.values()) tex.dispose();
        this.textCache.clear();
      })
      .catch(() => {});

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

  /** Swap a sprite's map; the shader program only changes when it goes from none to some. */
  private setMap(m: THREE.SpriteMaterial, tex: THREE.Texture) {
    if (m.map === tex) return;
    const had = m.map !== null;
    m.map = tex;
    if (!had) m.needsUpdate = true;
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

    // Every shot parameter glides toward the target (reduced motion snaps).
    const want = shotAt(track, timeline, t, this.motion);
    const prev = this.shot ?? want;
    const k = this.motion ? easeFor(dt) : 1;
    const shot: Shot = {
      ...want,
      x: prev.x + (want.x - prev.x) * k,
      y: prev.y + (want.y - prev.y) * k,
      distance: prev.distance + (want.distance - prev.distance) * k,
      pitch: prev.pitch + (want.pitch - prev.pitch) * k,
      yaw: prev.yaw + Math.atan2(Math.sin(want.yaw - prev.yaw), Math.cos(want.yaw - prev.yaw)) * k,
    };
    this.shot = shot;
    const pos = cameraPosition(shot);
    camera.position.set(pos.x, pos.y, pos.z);
    camera.lookAt(shot.x, 0, shot.y);
    this.tilt += (TILT_BLUR_PX[want.kind] - this.tilt) * k;
    post.setTilt(this.tilt);
    const foggy = this.weather === 'fog';
    fog.near = shot.distance * (foggy ? FOG.near : 1.2);
    fog.far = shot.distance * (foggy ? FOG.far : 4);
    const tx = shot.x;
    const ty = shot.y;
    const yaw = shot.yaw;
    // Shadow box scales with the eased distance; rebuild its matrix only on a visible change.
    const half = Math.min(450, Math.max(60, shot.distance * 0.6));
    if (Math.abs(half - this.shadowHalf) > 1) {
      this.shadowHalf = half;
      const cam = sun.shadow.camera;
      cam.left = cam.bottom = -half;
      cam.right = cam.top = half;
      cam.far = Math.min(1200, Math.max(500, shot.distance * 2.5));
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
      // Puddle reflection: the horse mirrored at its feet while it is near water in its lane.
      const r = this.reflections[v.lane];
      if (!r) continue;
      const wet = this.wet[v.lane] ?? [];
      let near = false;
      for (let i = 0; i < wet.length && !near; i++) near = m >= wet[i]![0] && m <= wet[i]![1];
      r.mesh.visible = near;
      if (!near) continue;
      const wobble = this.motion ? Math.sin(t * 9 + v.lane) * 0.04 : 0;
      r.mesh.position.set(here.x + wobble, 0, here.y);
      r.mesh.rotation.y = yaw;
      r.map.offset.copy(v.map.offset);
      r.map.repeat.copy(v.map.repeat);
    }

    // Effects live this frame, shared by the ghosts and the particle clouds.
    const live = activeAt(this.effects, t);
    // Stampede ghosts trail the horse in its own lane, wearing its current frame.
    let g = 0;
    for (const { effect, age } of live) {
      if (effect.kind !== 'stampede' || g + GHOSTS_EACH > this.ghosts.length) continue;
      const v = this.horses.find((h) => h.horse === effect.horse);
      if (!v) continue;
      const fade = Math.min(1, age / 0.3, (durationOf(effect) - age) / 0.5);
      const m = this.metres(timeline, v.horse, t);
      for (let k = 1; k <= GHOSTS_EACH; k++) {
        const ghost = this.ghosts[g++]!;
        const at = horsePoint(track, d, Math.max(0, m - k * GHOST_GAP_M), v.lane);
        ghost.mesh.position.set(at.x, 0, at.y);
        ghost.mesh.rotation.y = yaw;
        ghost.map.offset.copy(v.map.offset);
        ghost.map.repeat.copy(v.map.repeat);
        ghost.mesh.material.opacity = 0.4 * (1 - (k - 1) * 0.25) * fade;
        ghost.mesh.visible = true;
      }
    }
    for (; g < this.ghosts.length; g++) this.ghosts[g]!.mesh.visible = false;

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
      this.setMap(s.material, tex);
      s.position.set(x, y, z);
      const w = (tex.image as HTMLCanvasElement).width;
      s.scale.set(w * PIXEL_M * 0.25 * spin, 64 * PIXEL_M * 0.25, 1);
      s.visible = true;
    };
    // Popups first so they win if the pool runs out.
    for (const e of eventsBetween(timeline, t - POPUP_SECONDS, t)) {
      const at = where.get(e.horse);
      if (at) show(popupOf(e), at.x, 5 + (t - e.t) * 1.2, at.z, 1);
    }
    for (const e of this.held) {
      if (t < e.t - ITEM_HOLD_SECONDS || t >= e.t) continue;
      const at = where.get(e.horse);
      if (!at) continue;
      const icon = `${e.hot ? '\u{1F525}' : ''}${e.item ? ITEM_INFO[e.item].icon : '\u{1F4A8}'}`;
      const spin = this.motion ? Math.abs(Math.cos(t * 2 * Math.PI * 1.5)) || 0.05 : 1;
      show(icon, at.x, 4.2 + (this.motion ? Math.sin(t * 8) * 0.2 : 0), at.z, spin);
    }
    for (let i = used; i < this.labels.length; i++) this.labels[i]!.visible = false;

    // Trails from the horse's own past positions: one pass over the field for every worn trail.
    if (this.trails.size) {
      for (const tr of this.trails.values()) tr.n = 0;
      timeline.horses.forEach((horse, lane) => {
        const code = this.colors(horse, lane).trail;
        const tr = code ? this.trails.get(code) : undefined;
        const finished = timeline.finishTimes[horse] ?? Infinity;
        if (!tr || t <= 0 || t >= finished) return;
        for (let i = 1; i <= TRAIL; i++) {
          const m = progressAt(timeline, horse, Math.max(0, t - i * 0.08));
          const tp = horsePoint(track, d, m, lane);
          const c = trailColor(tr.style.color(i - 1, t));
          tr.pos.setXYZ(tr.n, tp.x, tr.style.hd.lift(i), tp.y);
          tr.col.setXYZ(tr.n++, c.r, c.g, c.b);
        }
      });
      for (const tr of this.trails.values()) {
        tr.points.geometry.setDrawRange(0, tr.n);
        tr.pos.needsUpdate = tr.col.needsUpdate = true;
      }
    }

    // Item effects: pure particles in each horse's running frame.
    if (this.fxPoints && this.fxBig) {
      const clouds = [this.fxPoints, this.fxBig].map((points) => ({
        points,
        pos: points.geometry.getAttribute('position') as THREE.BufferAttribute,
        col: points.geometry.getAttribute('color') as THREE.BufferAttribute,
        k: 0,
      }));
      const c = this.fxCol;
      for (const { effect, age } of live) {
        const lane = timeline.horses.indexOf(effect.horse);
        if (lane < 0) continue;
        const out = clouds[SPECIAL_KINDS.has(effect.kind) ? 1 : 0]!;
        const pts = particlesOf(effect.kind, age, durationOf(effect));
        if (out.k + pts.length > out.pos.count) continue; // cap: MAX_FX effects per cloud
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
        for (const pt of pts) {
          out.pos.setXYZ(
            out.k,
            here.x + ax * pt.ahead - az * pt.side,
            pt.up,
            here.y + az * pt.ahead + ax * pt.side,
          );
          c.set(pt.color).multiplyScalar(pt.alpha * 2.5);
          out.col.setXYZ(out.k, c.r, c.g, c.b);
          out.k++;
        }
      }
      for (const cl of clouds) {
        cl.points.geometry.setDrawRange(0, cl.k);
        cl.pos.needsUpdate = true;
        cl.col.needsUpdate = true;
      }
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
    if (this.rain) {
      const pos = this.rain.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < RAIN.drops; i++) {
        const dr = rainDrop(i, t);
        const x = tx + dr.x;
        const z = ty + dr.z;
        pos.setXYZ(i * 2, x, dr.y, z);
        pos.setXYZ(i * 2 + 1, x - RAIN.lean * RAIN.length, dr.y - RAIN.length, z);
      }
      pos.needsUpdate = true;
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
    const { renderer, overlay, hud } = this;
    if (!renderer || !overlay) return;
    // Badges, labels and the countdown over the post stack, in exact colours.
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(overlay, camera);
    if (t < 1 && hud) {
      const tex = this.text(t < 0 ? String(Math.ceil(-t)) : 'GO!');
      this.setMap(hud.sprite.material, tex);
      // 8 world units per 256 px, as before the canvas became variable.
      hud.sprite.scale.set(((tex.image as HTMLCanvasElement).width * 8) / 256, 2, 1);
      renderer.clearDepth();
      renderer.render(hud.scene, hud.camera);
    }
    renderer.autoClear = true;
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
    if (this.overlay) disposeTree(this.overlay); // text textures again: a second dispose is a no-op
    this.overlay = null;
    this.boxMesh = null;
    this.trails.clear(); // disposeTree(scene) frees their geometry
    this.fxPoints = null;
    this.fxBig = null;
    this.motes = null;
    this.confetti = null;
    this.effects = [];
    this.badges = [];
    this.labels = [];
    if (this.scene) disposeTree(this.scene);
    this.world?.sky.dispose();
    this.sheet?.dispose();
    for (const v of this.horses) v.map.dispose();
    for (const gh of this.ghosts) gh.map.dispose();
    this.ghosts = [];
    for (const r of this.reflections) r.map.dispose();
    this.reflections = [];
    this.wet = [];
    this.rain = null; // disposeTree(scene) above freed its geometry and material
    this.weather = 'clear';
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
