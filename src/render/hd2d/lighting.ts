export type PresetId = 'afternoon' | 'sunset' | 'night';

export interface Preset {
  readonly id: PresetId;
  /** Screen-space sky gradient, top then horizon. */
  readonly sky: readonly [string, string];
  /**
   * `from`: direction toward the light, Three.js coords (x, up, z), roughly unit length. Negative z
   * is the infield side, where the cameras sit, so horses on the home straight are front-lit.
   */
  readonly sun: {
    readonly color: string;
    readonly intensity: number;
    readonly from: readonly [number, number, number];
  };
  readonly hemi: { readonly sky: string; readonly ground: string; readonly intensity: number };
  readonly fog: string;
  readonly bloom: {
    readonly strength: number;
    readonly radius: number;
    readonly threshold: number;
  };
  /** Multiplies the final colour; saturation 1 = unchanged; vignette 0..1 darkening at corners. */
  readonly grade: {
    readonly tint: readonly [number, number, number];
    readonly saturation: number;
    readonly vignette: number;
  };
  readonly motes: 'dust' | 'fireflies';
  readonly floodlights: boolean;
  readonly shafts: boolean;
}

export const PRESETS: readonly Preset[] = [
  {
    id: 'afternoon',
    sky: ['#6fa8dc', '#f6e7c1'],
    sun: { color: '#ffe2a8', intensity: 2.2, from: [-0.4, 0.8, -0.45] },
    hemi: { sky: '#bcd7ff', ground: '#6b8f3a', intensity: 0.9 },
    fog: '#e9dcc0',
    bloom: { strength: 0.6, radius: 0.4, threshold: 0.85 },
    grade: { tint: [1.06, 1.0, 0.9], saturation: 1.1, vignette: 0.45 },
    motes: 'dust',
    floodlights: false,
    shafts: false,
  },
  {
    id: 'sunset',
    sky: ['#3b3f7a', '#ff9a5c'],
    sun: { color: '#ff9a5c', intensity: 2.6, from: [-0.8, 0.25, -0.3] },
    hemi: { sky: '#ffb38a', ground: '#4a3b5a', intensity: 0.7 },
    fog: '#f2a37a',
    bloom: { strength: 0.9, radius: 0.5, threshold: 0.75 },
    grade: { tint: [1.12, 0.96, 0.88], saturation: 1.15, vignette: 0.55 },
    motes: 'dust',
    floodlights: false,
    shafts: true,
  },
  {
    id: 'night',
    sky: ['#060a1f', '#1c2a55'],
    // Bright enough that silks read away from the floodlights (owner 2026-11-04).
    sun: { color: '#b4c6ff', intensity: 2.4, from: [0.3, 0.9, -0.2] },
    hemi: { sky: '#5a70b8', ground: '#2a3260', intensity: 1.8 },
    fog: '#0d1530',
    bloom: { strength: 1.2, radius: 0.6, threshold: 0.6 },
    grade: { tint: [0.92, 0.97, 1.1], saturation: 0.95, vignette: 0.6 },
    motes: 'fireflies',
    floodlights: true,
    shafts: false,
  },
];

/** The seed picks the preset, so the big screen and replays always agree. */
export const presetOf = (seed: number): Preset => PRESETS[((seed % 3) + 3) % 3]!;

export const presetById = (id: PresetId): Preset => PRESETS.find((p) => p.id === id)!;
