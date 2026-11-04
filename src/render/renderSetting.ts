/** Per-browser race graphics choice (a convenience, never game state). */
export type RenderMode = 'hd' | '2d';

export const RENDER_KEY = 'hrtc.render';

function safeStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadRenderMode(storage: Storage | null = safeStorage()): RenderMode {
  try {
    return storage?.getItem(RENDER_KEY) === '2d' ? '2d' : 'hd';
  } catch {
    return 'hd';
  }
}

export function saveRenderMode(mode: RenderMode, storage: Storage | null = safeStorage()): boolean {
  if (!storage) return false;
  try {
    storage.setItem(RENDER_KEY, mode);
    return true;
  } catch {
    return false;
  }
}

/** HD only when the viewer wants it, the browser has WebGL2 and HD hasn't failed on this page. */
export const pickRenderer = (mode: RenderMode, webgl2: boolean, failed: boolean): RenderMode =>
  mode === 'hd' && webgl2 && !failed ? 'hd' : '2d';

/** Probes a throwaway canvas and releases its context at once. */
export function webgl2Available(): boolean {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return gl !== null;
  } catch {
    return false;
  }
}
