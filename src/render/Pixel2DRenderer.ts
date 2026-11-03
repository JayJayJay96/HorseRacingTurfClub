import { eventsBetween, progressAt } from '../sim/playback.ts';
import type { HorseId, Timeline } from '../sim/types.ts';
import { WIDE, cameraAt, type Camera } from './camera.ts';
import { popupOf } from './items.ts';
import { BOX_COLOR, colorsOf } from './palette.ts';
import { drawHorse } from './sprites.ts';
import { finishS, horsePoint, trackBounds, trackPoint, type Point, type Track } from './track.ts';

/** Spec §4: every renderer plays the same Timeline on the same track. */
export interface RaceRenderer {
  /** `startAtMs` is the epoch ms of the gun (race time 0); earlier times show the countdown. */
  play(timeline: Timeline, track: Track, startAtMs: number): void;
  stop(): void;
}

/** Internal resolution; CSS scales it up with `image-rendering: pixelated`. */
export const VIEW = { width: 640, height: 360, tilt: 0.55 } as const;

const GRASS = '#3d7a3a';
const DIRT = '#b98a5a';
const RAIL = '#f5f5f5';
const STANDS = '#5d5d6e';
const EASE = 0.06;
const POPUP_SECONDS = 2;

export class Pixel2DRenderer implements RaceRenderer {
  private readonly canvas: HTMLCanvasElement;
  /** Read every frame, so renamed or late-loaded names show up without restarting. */
  private readonly names: () => Readonly<Record<HorseId, string>>;
  private raf = 0;
  private camera: Camera = WIDE;

  constructor(canvas: HTMLCanvasElement, names: () => Readonly<Record<HorseId, string>>) {
    this.canvas = canvas;
    this.names = names;
  }

  play(timeline: Timeline, track: Track, startAtMs: number) {
    this.stop();
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    this.camera = WIDE;
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
    const lanes = timeline.horses.length;
    const outer = lanes * track.laneWidth;
    const scale = (VIEW.width / (2 * trackBounds(track, lanes).halfWidth + 20)) * this.camera.zoom;
    const screen = (p: Point): Point => ({
      x: (p.x - this.camera.x) * scale + VIEW.width / 2,
      y: (p.y - this.camera.y) * scale * VIEW.tilt + VIEW.height / 2,
    });

    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = GRASS;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);

    // Track ribbon between the rails.
    const ring = (offset: number) => {
      for (let s = 0; s <= track.lap; s += 4) {
        const p = screen(trackPoint(track, s, offset));
        if (s === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.closePath();
    };
    ctx.beginPath();
    ring(outer + 2);
    ring(-2);
    ctx.fillStyle = DIRT;
    ctx.fill('evenodd');
    ctx.strokeStyle = RAIL;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ring(-2);
    ctx.stroke();
    ctx.beginPath();
    ring(outer + 2);
    ctx.stroke();

    // Stands below the home straight, then the finish line.
    const s0 = screen({ x: -track.straight / 2, y: track.radius + outer + 8 });
    const s1 = screen({ x: track.straight / 2, y: track.radius + outer + 40 });
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

    // Unopened boxes: a horse passes its lane's boxes in order, one pickup each.
    timeline.horses.forEach((horse, lane) => {
      const opened = timeline.events.filter(
        (e) => e.type === 'pickup' && e.horse === horse && e.t <= t,
      ).length;
      const boxes = [...(timeline.boxes[horse] ?? [])].sort((a, b) => a.at - b.at);
      for (const box of boxes.slice(opened)) {
        const p = screen(horsePoint(track, timeline.distance, box.at, lane));
        ctx.fillStyle = BOX_COLOR[box.kind];
        ctx.fillRect(Math.round(p.x) - 1, Math.round(p.y) - 1, 3, 3);
      }
    });

    // Horses, back to front.
    const where = new Map<HorseId, Point>();
    const drawn = timeline.horses
      .map((horse, lane) => {
        const m = progressAt(timeline, horse, t);
        const here = horsePoint(track, timeline.distance, m, lane);
        const ahead = horsePoint(track, timeline.distance, m + 1, lane);
        const p = screen(here);
        where.set(horse, p);
        return { horse, lane, m, p, facing: (ahead.x >= here.x ? 1 : -1) as 1 | -1 };
      })
      .sort((a, b) => a.p.y - b.p.y);
    const names = this.names();
    ctx.textAlign = 'center';
    for (const h of drawn) {
      drawHorse(ctx, h.p.x, h.p.y, colorsOf(h.lane), Math.floor(h.m / 1.5), h.facing);
      if (this.camera.zoom > 1.5) {
        ctx.font = '8px sans-serif';
        ctx.fillStyle = '#fff';
        ctx.fillText(names[h.horse] ?? '?', h.p.x, h.p.y - 17);
      }
    }

    // Item popups float up for POPUP_SECONDS.
    ctx.font = '10px sans-serif';
    for (const e of eventsBetween(timeline, t - POPUP_SECONDS, t)) {
      const p = where.get(e.horse);
      if (!p) continue;
      ctx.fillStyle = '#fff';
      ctx.fillText(popupOf(e), p.x, p.y - 26 - (t - e.t) * 8);
    }

    // Countdown, then GO!
    if (t < 1) {
      ctx.font = 'bold 64px sans-serif';
      ctx.fillStyle = '#fff';
      ctx.fillText(t < 0 ? String(Math.ceil(-t)) : 'GO!', VIEW.width / 2, VIEW.height / 2 + 20);
    }
  }
}
