import { memo, useEffect, useRef } from 'react';
import { CELL, FRAMES, outlineCell } from './hd2d/sheet.ts';
import type { HorseColors } from './palette.ts';
import { drawHorse } from './sprites.ts';

/**
 * Side-view horse(s) facing right, one CELL per frame left to right, each outlined like the HD
 * sheet. A still sprite (frames = 1) uses gallop frame 1, the pose the cut-in always showed.
 */
export function paintHorse(ctx: CanvasRenderingContext2D, colors: HorseColors, frames: number) {
  const w = CELL.w * frames;
  ctx.clearRect(0, 0, w, CELL.h);
  for (let f = 0; f < frames; f++) {
    drawHorse(
      ctx,
      f * CELL.w + CELL.footX,
      CELL.footY,
      colors,
      frames === 1 ? 1 : f,
      'side-right',
      1,
    );
  }
  const img = ctx.getImageData(0, 0, w, CELL.h);
  for (let f = 0; f < frames; f++) outlineCell(img.data, w, f * CELL.w, 0, CELL.w, CELL.h);
  ctx.putImageData(img, 0, 0);
}

type Props = {
  colors: HorseColors;
  /** Whole-pixel CSS scale: sm 1x, md 2x, lg 4x (app.css `.horse-sprite-*`). */
  size: 'sm' | 'md' | 'lg';
  /** 4-frame gallop (CSS steps over a strip); podium winner only. */
  animated?: boolean;
  className?: string;
};

function Sprite({ colors, size, animated = false, className }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const frames = animated ? FRAMES : 1;
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (ctx) paintHorse(ctx, colors, frames);
  }, [colors, frames]);
  const cls = `horse-sprite horse-sprite-${size}${className ? ` ${className}` : ''}`;
  const canvas = (
    <canvas
      ref={ref}
      className={animated ? undefined : cls}
      width={CELL.w * frames}
      height={CELL.h}
      aria-hidden="true"
    />
  );
  return animated ? (
    <span className={`${cls} is-animated`} aria-hidden="true">
      {canvas}
    </span>
  ) : (
    canvas
  );
}

/** Colours that change what is drawn. `trail` and `celebration` are not drawn on a sprite, so they are ignored. */
export const sameColors = (a: HorseColors, b: HorseColors) =>
  a.coat === b.coat &&
  a.mane === b.mane &&
  a.silk === b.silk &&
  (a.pattern ?? null) === (b.pattern ?? null) &&
  (a.cap ?? null) === (b.cap ?? null);

/**
 * The 2D pixel horse beside a horse's name (spec 2026-11-05 polish section 1). Decorative: the
 * name is always next to it. Memoised on the colour values because callers build a new colours
 * object every render (the standings re-render at 4 Hz), so a canvas only redraws on a change.
 */
export const HorseSprite = memo(
  Sprite,
  (a, b) =>
    a.size === b.size &&
    a.animated === b.animated &&
    a.className === b.className &&
    sameColors(a.colors, b.colors),
);
