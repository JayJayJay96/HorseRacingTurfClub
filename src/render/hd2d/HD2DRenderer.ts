import * as THREE from 'three';
import { progressAt } from '../../sim/playback.ts';
import type { HorseId, Timeline } from '../../sim/types.ts';
import { COAST_SPEED, defaultColors, type ColorsOf } from '../Pixel2DRenderer.ts';
import type { RaceRenderer } from '../renderer.ts';
import { poseOf } from '../sprites.ts';
import { horsePoint, type Track } from '../track.ts';
import { presetById, presetOf, type Preset, type PresetId } from './lighting.ts';
import { FOV_DEG, LOOK_PAST_M, PIXEL_M, TILT_BLUR_PX, distanceForScale } from './look.ts';
import { buildPost, type Post } from './post.ts';
import { buildWorld, cutoutMaterials, disposeTree, type World } from './scene.ts';
import { CELL, cellOf, cellUv, drawSheet, sheetSize } from './sheet.ts';

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

const CHASE_PITCH = (35 * Math.PI) / 180;

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
    cam.left = cam.bottom = -60;
    cam.right = cam.top = 60;
    cam.near = 1;
    cam.far = 500;
    cam.updateProjectionMatrix();
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

    const camera = new THREE.PerspectiveCamera(FOV_DEG, 16 / 9, 1, 3000);
    this.camera = camera;
    this.post = buildPost(renderer, scene, camera, preset);
    this.post.setTilt(TILT_BLUR_PX.chase);

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

    let last = performance.now();
    const frame = () => {
      const now = performance.now();
      if (import.meta.env.DEV) {
        // Dev-only readout for /sandbox (spec §4 performance target).
        const g = globalThis as { hd2dFrameMs?: number };
        g.hd2dFrameMs = (g.hd2dFrameMs ?? 16) * 0.9 + (now - last) * 0.1;
      }
      last = now;
      const t = this.opts.freezeT ?? (Date.now() - startAtMs) / 1000;
      try {
        this.draw(timeline, track, t);
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

  /** Metres along the race, coasting past the line after the finish (display only). */
  private metres(timeline: Timeline, horse: HorseId, t: number) {
    const finished = timeline.finishTimes[horse] ?? Infinity;
    return progressAt(timeline, horse, t) + Math.max(0, t - finished) * COAST_SPEED;
  }

  private draw(timeline: Timeline, track: Track, t: number) {
    const { camera, post, sun, world, preset, fog } = this;
    if (!camera || !post || !sun || !world || !preset || !fog) return;
    const d = timeline.distance;

    // Look-test camera: chase-style, centred on the top 3, from the infield side.
    const order = [...timeline.horses].sort(
      (a, b) => this.metres(timeline, b, t) - this.metres(timeline, a, t),
    );
    const pack = order
      .slice(0, 3)
      .map((h) => horsePoint(track, d, this.metres(timeline, h, t), timeline.horses.indexOf(h)));
    const lead = this.metres(timeline, order[0]!, t);
    const a = horsePoint(track, d, lead, 0);
    const b = horsePoint(track, d, lead, 1);
    const yaw = Math.atan2(-(b.x - a.x), -(b.y - a.y)); // inward normal: infield side
    const tx = pack.reduce((s, p) => s + p.x, 0) / pack.length - Math.sin(yaw) * LOOK_PAST_M;
    const ty = pack.reduce((s, p) => s + p.y, 0) / pack.length - Math.cos(yaw) * LOOK_PAST_M;
    const dist = distanceForScale();
    camera.position.set(
      tx + Math.sin(yaw) * Math.cos(CHASE_PITCH) * dist,
      Math.sin(CHASE_PITCH) * dist,
      ty + Math.cos(yaw) * Math.cos(CHASE_PITCH) * dist,
    );
    camera.lookAt(tx, 0, ty);
    fog.near = dist * 1.2;
    fog.far = dist * 4;

    // Sun shadows follow the camera target.
    const [fx, fy, fz] = preset.sun.from;
    sun.target.position.set(tx, 0, ty);
    sun.position.set(tx + fx * 200, fy * 200, ty + fz * 200);
    // Everything flat faces the camera's yaw (parallel billboards).
    for (const o of world.billboards) o.rotation.y = yaw;

    // Horses: position, facing, pose and gallop frame.
    const { p, q } = this;
    for (const v of this.horses) {
      const m = this.metres(timeline, v.horse, t);
      const here = horsePoint(track, d, m, v.lane);
      const ahead = horsePoint(track, d, m + 1, v.lane);
      v.mesh.position.set(here.x, 0, here.y);
      v.mesh.rotation.y = yaw;
      p.set(here.x, 0, here.y).project(camera);
      q.set(ahead.x, 0, ahead.y).project(camera);
      const pose = poseOf(q.x - p.x, -(q.y - p.y));
      const uv = cellUv(timeline.horses.length, cellOf(v.lane, pose, Math.floor(m / 1.5)));
      v.map.offset.set(uv.offsetX, uv.offsetY);
      v.map.repeat.set(uv.repeatX, uv.repeatY);
    }

    post.composer.render();
  }

  stop() {
    cancelAnimationFrame(this.raf);
    this.resize?.disconnect();
    this.resize = null;
    this.canvas.removeEventListener('webglcontextlost', this.lost);
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
    this.lastW = this.lastH = 0;
    this.preset = null;
    this.horses = [];
  }
}
