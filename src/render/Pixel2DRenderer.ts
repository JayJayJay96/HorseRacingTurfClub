import { eventsBetween, progressAt } from '../sim/playback.ts';
import type { BoxSpot, HorseId, RaceEvent, Timeline } from '../sim/types.ts';
import { WIDE, cameraAt, type Camera } from './camera.ts';
import { ITEM_INFO, popupOf } from './items.ts';
import { BOX_COLOR, colorsOf, type HorseColors } from './palette.ts';
import { drawHorse, drawNumber, poseOf } from './sprites.ts';
import type { RaceRenderer } from './renderer.ts';
import { finishS, horsePoint, trackBounds, trackPoint, type Point, type Track } from './track.ts';

export type { RaceRenderer } from './renderer.ts';

export type ColorsOf = (horse: HorseId, lane: number) => HorseColors;
/** Private rooms and the sandbox: colours by lane. */
export const defaultColors: ColorsOf = (_horse, lane) => colorsOf(lane);

/** Internal resolution; CSS scales it up with `image-rendering: pixelated`. */
export const VIEW = { width: 640, height: 360, tilt: 0.55 } as const;

const GRASS = '#3d7a3a';
const DIRT = '#b98a5a';
const RAIL = '#f5f5f5';
const STANDS = '#5d5d6e';
const EASE = 0.06;
export const POPUP_SECONDS = 2;
/**
 * Display only: a box is drawn where its horse was this long before the sim opened it, and the
 * item spins over the horse until then, so the effect reads as landing after the grab.
 */
export const ITEM_HOLD_SECONDS = 1.5;
/** Finished horses ease past the line (m/s) instead of piling up on it. Display only. */
export const COAST_SPEED = 10;
/** A box appears once its horse is within this share of the race before it (owner 2026-11-04). */
export const BOX_REVEAL = 0.1;
/** Trail length in samples, and the on-screen gap between samples (px at size 1). */
export const TRAIL = 8;
const TRAIL_GAP = 3;
const TRAIL_COLOR = { 'trail:dust': '#a39382', 'trail:sparkle': '#ffd54f' } as const;

/** Count of sorted `times` that are <= t. */
function countUpTo(times: readonly number[], t: number): number {
  let lo = 0;
  let hi = times.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid]! <= t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export class Pixel2DRenderer implements RaceRenderer {
  private readonly canvas: HTMLCanvasElement;
  private raf = 0;
  private readonly colors: ColorsOf;
  private camera: Camera = WIDE;
  /** EASE, or 1 (snap) when the viewer prefers reduced motion; read once per play(). */
  private ease = EASE;
  private motion = true;
  // Per-timeline caches, built in play() so draw() does no per-frame sorting or filtering.
  private boxes: (readonly BoxSpot[])[] = [];
  /** Per lane, sorted: when each box is grabbed on screen (ITEM_HOLD_SECONDS before it opens). */
  private grabs: number[][] = [];
  /** Per lane: where each box is drawn, in metres. */
  private boxAt: number[][] = [];
  private held: Extract<RaceEvent, { type: 'pickup' }>[] = [];
  /** Both rails as one closed path in world metres; draw() maps it to screen space. */
  private ribbon = new Path2D();
  private halfWidth = 1;
  /** Per lane: the last TRAIL world positions as x,y pairs, a ring written at `trailHead`. */
  private trails: Float64Array[] = [];
  private trailHead: number[] = [];
  private trailCount: number[] = [];

  constructor(canvas: HTMLCanvasElement, colors: ColorsOf = defaultColors) {
    this.canvas = canvas;
    this.colors = colors;
  }

  play(timeline: Timeline, track: Track, startAtMs: number) {
    this.stop();
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    this.camera = WIDE;
    this.motion = !(
      typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
    );
    this.ease = this.motion ? EASE : 1;
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
    // One pickup per box, in order; a box nobody reached stays at its sim spot.
    this.boxAt = this.boxes.map((boxes, lane) =>
      boxes.map((box, i) => {
        const grab = this.grabs[lane]![i];
        return grab === undefined ? box.at : progressAt(timeline, timeline.horses[lane]!, grab);
      }),
    );
    this.trails = timeline.horses.map(() => new Float64Array(TRAIL * 2));
    this.trailHead = timeline.horses.map(() => 0);
    this.trailCount = timeline.horses.map(() => 0);
    const outer = timeline.horses.length * track.laneWidth;
    this.halfWidth = trackBounds(track, timeline.horses.length).halfWidth;
    this.ribbon = new Path2D();
    for (const offset of [outer + 2, -2]) {
      for (let s = 0; s <= track.lap; s += 4) {
        const p = trackPoint(track, s, offset);
        if (s === 0) this.ribbon.moveTo(p.x, p.y);
        else this.ribbon.lineTo(p.x, p.y);
      }
      this.ribbon.closePath();
    }
    const frame = () => {
      this.draw(ctx, timeline, track, (Date.now() - startAtMs) / 1000);
      this.raf = requestAnimationFrame(frame);
    };
    frame();
  }

  stop() {
    cancelAnimationFrame(this.raf);
  }

  /**
   * A sample each time the horse is `gap` world metres past the last one, so trails look the same
   * length at any zoom. Cleared at the gate and once the horse finishes (then it coasts out).
   */
  private recordTrail(lane: number, at: Point, racing: boolean, gap: number) {
    const count = this.trailCount[lane]!;
    if (!racing) {
      this.trailCount[lane] = 0;
      return;
    }
    const ring = this.trails[lane]!;
    const head = this.trailHead[lane]!;
    const last = ((head - 1 + TRAIL) % TRAIL) * 2;
    if (count && Math.hypot(at.x - ring[last]!, at.y - ring[last + 1]!) < gap) return;
    ring[head * 2] = at.x;
    ring[head * 2 + 1] = at.y;
    this.trailHead[lane] = (head + 1) % TRAIL;
    this.trailCount[lane] = Math.min(TRAIL, count + 1);
  }

  private draw(ctx: CanvasRenderingContext2D, timeline: Timeline, track: Track, t: number) {
    const target = cameraAt(track, timeline, t);
    const c = this.camera;
    this.camera = {
      x: c.x + (target.x - c.x) * this.ease,
      y: c.y + (target.y - c.y) * this.ease,
      zoom: c.zoom + (target.zoom - c.zoom) * this.ease,
    };
    const outer = timeline.horses.length * track.laneWidth;
    const scale = (VIEW.width / (2 * this.halfWidth + 20)) * this.camera.zoom;
    const screen = (p: Point): Point => ({
      x: (p.x - this.camera.x) * scale + VIEW.width / 2,
      y: (p.y - this.camera.y) * scale * VIEW.tilt + VIEW.height / 2,
    });

    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = GRASS;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);

    // Track ribbon between the rails: the cached world path under screen()'s affine map, stroked
    // under the identity transform so the rails stay 1 px wide.
    const ribbon = new Path2D();
    ribbon.addPath(
      this.ribbon,
      new DOMMatrix([
        scale,
        0,
        0,
        scale * VIEW.tilt,
        VIEW.width / 2 - this.camera.x * scale,
        VIEW.height / 2 - this.camera.y * scale * VIEW.tilt,
      ]),
    );
    ctx.fillStyle = DIRT;
    ctx.fill(ribbon, 'evenodd');
    ctx.strokeStyle = RAIL;
    ctx.lineWidth = 1;
    ctx.stroke(ribbon);

    // Stands below the home straight, then the finish line.
    const { stands } = track;
    const s0 = screen({ x: stands.x0, y: stands.y0 + outer });
    const s1 = screen({ x: stands.x1, y: stands.y1 + outer });
    ctx.fillStyle = STANDS;
    ctx.fillRect(s0.x, s0.y, s1.x - s0.x, s1.y - s0.y);
    const f0 = screen(trackPoint(track, finishS(track), -2));
    const f1 = screen(trackPoint(track, finishS(track), outer + 2));
    ctx.strokeStyle = RAIL;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(f0.x, f0.y);
    ctx.lineTo(f1.x, f1.y);
    ctx.stroke();

    // Unopened boxes: a horse passes its lane's boxes in order, one pickup each. A box only shows
    // when its own horse is close, so nobody runs over a box that does nothing for them.
    timeline.horses.forEach((horse, lane) => {
      const boxes = this.boxes[lane] ?? [];
      const reach = progressAt(timeline, horse, t) + timeline.distance * BOX_REVEAL;
      for (let i = countUpTo(this.grabs[lane] ?? [], t); i < boxes.length; i++) {
        const box = boxes[i]!;
        const at = this.boxAt[lane]![i]!;
        if (at > reach) break;
        const p = screen(horsePoint(track, timeline.distance, at, lane));
        ctx.fillStyle = BOX_COLOR[box.kind];
        ctx.fillRect(Math.round(p.x) - 1, Math.round(p.y) - 1, 3, 3);
      }
    });

    // Horses, back to front.
    const size = this.camera.zoom > 3 ? 2 : 1;
    const gap = (TRAIL_GAP * size) / scale;
    const where = new Map<HorseId, Point>();
    const drawn = timeline.horses
      .map((horse, lane) => {
        const finished = timeline.finishTimes[horse] ?? Infinity;
        const m = progressAt(timeline, horse, t) + Math.max(0, t - finished) * COAST_SPEED;
        const here = horsePoint(track, timeline.distance, m, lane);
        const p = screen(here);
        const a = screen(horsePoint(track, timeline.distance, m + 1, lane));
        where.set(horse, p);
        const colors = this.colors(horse, lane);
        if (colors.trail) this.recordTrail(lane, here, t > 0 && t < finished, gap);
        return { horse, lane, m, p, colors, pose: poseOf(a.x - p.x, a.y - p.y) };
      })
      .sort((a, b) => a.p.y - b.p.y);
    // Numbers, not name tags: a tight pack makes names unreadable; #n matches the standings list.
    // Trails under every horse, in world points mapped like screen() but without allocating.
    for (const h of drawn) {
      const kind = h.colors.trail;
      const count = this.trailCount[h.lane] ?? 0;
      if (!count || (kind !== 'trail:dust' && kind !== 'trail:sparkle')) continue;
      const ring = this.trails[h.lane]!;
      const head = this.trailHead[h.lane]!;
      for (let i = 0; i < count; i++) {
        const k = ((head - 1 - i + TRAIL) % TRAIL) * 2; // newest first
        const x = (ring[k]! - this.camera.x) * scale + VIEW.width / 2;
        const y = (ring[k + 1]! - this.camera.y) * scale * VIEW.tilt + VIEW.height / 2;
        ctx.globalAlpha = 1 - (i + 1) / (TRAIL + 1);
        if (kind === 'trail:dust') {
          ctx.fillStyle = TRAIL_COLOR[kind];
          ctx.fillRect(Math.round(x) - size, Math.round(y) - size, 2 * size, size);
        } else {
          // Gold/white flicker, lifted to the jockey's height.
          ctx.fillStyle = (Math.floor(t * 12) + i) % 2 ? '#ffffff' : TRAIL_COLOR[kind];
          ctx.fillRect(Math.round(x), Math.round(y) - (6 + (i % 3) * 2) * size, size, size);
        }
      }
      ctx.globalAlpha = 1;
    }
    for (const h of drawn) {
      drawHorse(ctx, h.p.x, h.p.y, h.colors, Math.floor(h.m / 1.5), h.pose, size);
    }
    // Badges after every horse so a horse behind never covers a number.
    for (const h of drawn)
      drawNumber(ctx, h.p.x, h.p.y - 17 * size - 2, h.lane + 1, h.colors.silk, size);
    const above = (p: Point) => p.y - 26 * size - 4;

    // Grabbed items hover and spin over their horse until they open.
    ctx.textAlign = 'center';
    ctx.font = `${10 * size}px sans-serif`;
    for (const e of this.held) {
      if (t < e.t - ITEM_HOLD_SECONDS || t >= e.t) continue;
      const p = where.get(e.horse);
      if (!p) continue;
      const icon = e.item ? ITEM_INFO[e.item].icon : '💨';
      const bob = this.motion ? Math.sin(t * 8) * 2 : 0;
      ctx.save();
      ctx.translate(p.x, above(p) + bob);
      if (this.motion) ctx.scale(Math.cos(t * 2 * Math.PI * 1.5) || 0.01, 1);
      ctx.fillText(icon, 0, 0);
      ctx.restore();
    }

    // Item popups float up for POPUP_SECONDS.
    ctx.font = '10px sans-serif';
    // White text crosses grass and dirt (3.1:1 on dirt), so it gets a dark outline.
    ctx.strokeStyle = '#000';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3;
    for (const e of eventsBetween(timeline, t - POPUP_SECONDS, t)) {
      const p = where.get(e.horse);
      if (!p) continue;
      const y = above(p) - (t - e.t) * 8;
      ctx.fillStyle = '#fff';
      ctx.strokeText(popupOf(e), p.x, y);
      ctx.fillText(popupOf(e), p.x, y);
    }

    // Countdown, then GO!
    if (t < 1) {
      ctx.font = 'bold 64px sans-serif';
      ctx.fillStyle = '#fff';
      ctx.lineWidth = 6;
      const label = t < 0 ? String(Math.ceil(-t)) : 'GO!';
      ctx.strokeText(label, VIEW.width / 2, VIEW.height / 2 + 20);
      ctx.fillText(label, VIEW.width / 2, VIEW.height / 2 + 20);
    }
  }
}
