import { eventsBetween, progressAt } from '../sim/playback.ts';
import type { BoxSpot, HorseId, Timeline } from '../sim/types.ts';
import { WIDE, cameraAt, type Camera } from './camera.ts';
import { popupOf } from './items.ts';
import { BOX_COLOR, colorsOf, type HorseColors } from './palette.ts';
import { drawHorse, poseOf } from './sprites.ts';
import { finishS, horsePoint, trackBounds, trackPoint, type Point, type Track } from './track.ts';

/** Spec §4: every renderer plays the same Timeline on the same track. */
export interface RaceRenderer {
  /** `startAtMs` is the epoch ms of the gun (race time 0); earlier times show the countdown. */
  play(timeline: Timeline, track: Track, startAtMs: number): void;
  stop(): void;
}

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
const POPUP_SECONDS = 2;
/** Finished horses ease past the line (m/s) instead of piling up on it. Display only. */
const COAST_SPEED = 10;
/** A box appears once its horse is within this share of the race before it (owner 2026-11-04). */
export const BOX_REVEAL = 0.1;

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
  // Per-timeline caches, built in play() so draw() does no per-frame sorting or filtering.
  private boxes: (readonly BoxSpot[])[] = [];
  private pickups: number[][] = [];
  /** Both rails as one closed path in world metres; draw() maps it to screen space. */
  private ribbon = new Path2D();
  private halfWidth = 1;

  constructor(canvas: HTMLCanvasElement, colors: ColorsOf = defaultColors) {
    this.canvas = canvas;
    this.colors = colors;
  }

  play(timeline: Timeline, track: Track, startAtMs: number) {
    this.stop();
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    this.camera = WIDE;
    this.boxes = timeline.horses.map((h) =>
      [...(timeline.boxes[h] ?? [])].sort((a, b) => a.at - b.at),
    );
    this.pickups = timeline.horses.map((h) =>
      timeline.events
        .filter((e) => e.type === 'pickup' && e.horse === h)
        .map((e) => e.t)
        .sort((a, b) => a - b),
    );
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

  private draw(ctx: CanvasRenderingContext2D, timeline: Timeline, track: Track, t: number) {
    const target = cameraAt(track, timeline, t);
    const c = this.camera;
    this.camera = {
      x: c.x + (target.x - c.x) * EASE,
      y: c.y + (target.y - c.y) * EASE,
      zoom: c.zoom + (target.zoom - c.zoom) * EASE,
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
      for (let i = countUpTo(this.pickups[lane] ?? [], t); i < boxes.length; i++) {
        const box = boxes[i]!;
        if (box.at > reach) break;
        const p = screen(horsePoint(track, timeline.distance, box.at, lane));
        ctx.fillStyle = BOX_COLOR[box.kind];
        ctx.fillRect(Math.round(p.x) - 1, Math.round(p.y) - 1, 3, 3);
      }
    });

    // Horses, back to front.
    const where = new Map<HorseId, Point>();
    const drawn = timeline.horses
      .map((horse, lane) => {
        const finished = timeline.finishTimes[horse] ?? Infinity;
        const m = progressAt(timeline, horse, t) + Math.max(0, t - finished) * COAST_SPEED;
        const here = horsePoint(track, timeline.distance, m, lane);
        const p = screen(here);
        const a = screen(horsePoint(track, timeline.distance, m + 1, lane));
        where.set(horse, p);
        return { horse, lane, m, p, pose: poseOf(a.x - p.x, a.y - p.y) };
      })
      .sort((a, b) => a.p.y - b.p.y);
    // No name tags: a tight pack makes them unreadable; silks match the standings list.
    const size = this.camera.zoom > 3 ? 2 : 1;
    for (const h of drawn) {
      drawHorse(
        ctx,
        h.p.x,
        h.p.y,
        this.colors(h.horse, h.lane),
        Math.floor(h.m / 1.5),
        h.pose,
        size,
      );
    }

    // Item popups float up for POPUP_SECONDS.
    ctx.textAlign = 'center';
    ctx.font = '10px sans-serif';
    for (const e of eventsBetween(timeline, t - POPUP_SECONDS, t)) {
      const p = where.get(e.horse);
      if (!p) continue;
      ctx.fillStyle = '#fff';
      ctx.fillText(popupOf(e), p.x, p.y - 14 * size - 6 - (t - e.t) * 8);
    }

    // Countdown, then GO!
    if (t < 1) {
      ctx.font = 'bold 64px sans-serif';
      ctx.fillStyle = '#fff';
      ctx.fillText(t < 0 ? String(Math.ceil(-t)) : 'GO!', VIEW.width / 2, VIEW.height / 2 + 20);
    }
  }
}
