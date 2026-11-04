/**
 * Look targets (spec "Look targets"). Task 9's look test may change these numbers; once the owner
 * approves, they are copied into the spec and frozen.
 */

/** World size of one sprite or texture pixel, metres (Look target 2). */
export const PIXEL_M = 0.15;
/** Screen pixels per sprite pixel on the chase shot at REFERENCE_HEIGHT (Look target 2). */
export const PIXEL_SCALE = 4.5;
export const REFERENCE_HEIGHT = 1080;
/** Vertical field of view, degrees (Look target 3). */
export const FOV_DEG = 25;
/** Ground texture tile, in pixels and metres. */
export const TILE_PX = 32;
export const TILE_M = TILE_PX * PIXEL_M;
/** Camera pitch below horizontal per shot, degrees (Look target 3). */
export const PITCH_DEG = { wide: 50, chase: 35, finish: 28 } as const;
/** Finish shot sits this much farther than the chase shot. */
export const FINISH_DISTANCE_SCALE = 1.3;
/** Tilt-shift blur per shot, in screen pixels at the band edges. */
export const TILT_BLUR_PX = { wide: 4, chase: 2, finish: 2 } as const;
/** Where the sharp band sits, as a share of the screen height from the bottom. */
export const TILT_FOCUS = 0.45;
/**
 * Chase and finish shots aim this far past the pack, away from the camera, so the horses sit in
 * the lower part of the frame and the stands fill the backdrop.
 */
export const LOOK_PAST_M = 12;
/** Per-frame ease toward the shot target (same as the 2D camera). */
export const EASE = 0.06;

/** Ease factor for a frame of `dt` seconds; equals EASE at 60 fps. */
export function easeFor(dt: number): number {
  return 1 - Math.pow(1 - EASE, Math.min(0.25, Math.max(0, dt)) * 60);
}

/** Camera distance at which one PIXEL_M covers `pixelScale` screen px at `viewH`. */
export function distanceForScale(
  pixelScale: number = PIXEL_SCALE,
  fovDeg: number = FOV_DEG,
  viewH: number = REFERENCE_HEIGHT,
): number {
  const pxPerMetre = pixelScale / PIXEL_M;
  return viewH / (2 * Math.tan((fovDeg * Math.PI) / 360) * pxPerMetre);
}
