import type { AudioSettings } from './audioSettings.ts';
import {
  noteToFrequency,
  stepSeconds,
  STEPS_PER_LOOP,
  THEMES,
  type MusicTheme,
} from './chiptune.ts';
import type { SfxName } from './raceCues.ts';

/**
 * All sound in the app, adapted from King of Fate's engine. Music and effects are synthesised at
 * runtime (Web Audio); the commentator uses the browser's speech. Every method is a safe no-op
 * when audio is unavailable or the browser has not been unlocked by a gesture yet.
 */
export interface SoundEngine {
  readonly webAudio: boolean;
  /** Resume the AudioContext; call from a user gesture (also done automatically on the first one). */
  unlock(): void;
  apply(settings: AudioSettings): void;
  /** Desired background loop; starts once audio is unlocked. null = silence. */
  setMusic(theme: MusicTheme | null): void;
  sfx(name: SfxName): void;
  /** English text-to-speech on the voice level; stale lines are dropped so speech never lags. */
  say(text: string): void;
  dispose(): void;
}

const LOOKAHEAD_S = 0.15;
const SCHEDULER_MS = 30;

export function createSoundEngine(): SoundEngine {
  const Ctor =
    globalThis.AudioContext ??
    (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

  let settings: AudioSettings | null = null;
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let musicBus: GainNode | null = null;
  let sfxBus: GainNode | null = null;
  let noise: AudioBuffer | null = null;
  let desiredTheme: MusicTheme | null = null;
  let sequencer: { theme: MusicTheme; stop: () => void } | null = null;
  let queued = 0;

  const running = (): AudioContext | null => (ctx && ctx.state === 'running' ? ctx : null);
  const musicLevel = () => (settings && !settings.muted ? settings.music : 0);
  const sfxLevel = () => (settings && !settings.muted ? settings.sfx : 0);
  const voiceLevel = () => (settings && !settings.muted ? settings.voice : 0);

  // Speech can't be routed through Web Audio, so there is no voice bus: say() sets its own volume.
  function ensureGraph(c: AudioContext) {
    if (master) return;
    master = c.createGain();
    master.connect(c.destination);
    musicBus = c.createGain();
    musicBus.connect(master);
    sfxBus = c.createGain();
    sfxBus.connect(master);
    noise = c.createBuffer(1, c.sampleRate * 0.5, c.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    applyLevels();
  }

  function applyLevels() {
    const c = ctx;
    if (c && musicBus && sfxBus) {
      musicBus.gain.setTargetAtTime(musicLevel() * 0.35, c.currentTime, 0.03);
      sfxBus.gain.setTargetAtTime(sfxLevel() * 0.6, c.currentTime, 0.03);
    }
  }

  // ---------- synth voices ----------
  function osc(
    c: AudioContext,
    bus: AudioNode,
    type: OscillatorType,
    from: number,
    to: number,
    at: number,
    seconds: number,
    volume: number,
  ) {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(from, at);
    if (to !== from) o.frequency.exponentialRampToValueAtTime(Math.max(1, to), at + seconds);
    g.gain.setValueAtTime(volume, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
    o.connect(g).connect(bus);
    o.start(at);
    o.stop(at + seconds + 0.02);
  }

  function noiseHit(
    c: AudioContext,
    bus: AudioNode,
    at: number,
    seconds: number,
    volume: number,
    filter: BiquadFilterType,
    freq: number,
  ) {
    if (!noise) return;
    const src = c.createBufferSource();
    src.buffer = noise;
    src.loop = seconds > 0.5;
    const f = c.createBiquadFilter();
    f.type = filter;
    f.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(volume, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
    src.connect(f).connect(g).connect(bus);
    src.start(at);
    src.stop(at + seconds + 0.02);
  }

  function drum(c: AudioContext, bus: AudioNode, hit: string, at: number) {
    if (hit === 'K') osc(c, bus, 'sine', 150, 40, at, 0.15, 0.9);
    else if (hit === 'S') noiseHit(c, bus, at, 0.12, 0.5, 'bandpass', 1800);
    else if (hit === 'H') noiseHit(c, bus, at, 0.04, 0.25, 'highpass', 7000);
    else if (hit === 'T') osc(c, bus, 'sine', 110, 55, at, 0.25, 0.9);
  }

  // ---------- music ----------
  function startSequencer(theme: MusicTheme) {
    const c = running();
    if (!c || !musicBus) return;
    stopSequencer();
    const bus = musicBus;
    const t = THEMES[theme];
    const step = stepSeconds(t);
    let next = c.currentTime + 0.05;
    let index = 0;
    const timer = setInterval(() => {
      while (next < c.currentTime + LOOKAHEAD_S) {
        const i = index % STEPS_PER_LOOP;
        const lead = t.lead[i];
        const bass = t.bass[i];
        const hit = t.drums[i];
        if (lead) {
          const f = noteToFrequency(lead);
          osc(c, bus, 'square', f, f, next, step * 1.8, 0.16);
        }
        if (bass) {
          const f = noteToFrequency(bass);
          osc(c, bus, 'triangle', f, f, next, step * 0.95, 0.5);
        }
        if (hit) drum(c, bus, hit, next);
        next += step;
        index++;
      }
    }, SCHEDULER_MS);
    sequencer = { theme, stop: () => clearInterval(timer) };
  }

  function stopSequencer() {
    sequencer?.stop();
    sequencer = null;
  }

  function syncMusic() {
    const c = running();
    if (!desiredTheme) stopSequencer();
    else if (c && sequencer?.theme !== desiredTheme) startSequencer(desiredTheme);
  }

  // ---------- sfx ----------
  function playSfx(name: SfxName) {
    const c = running();
    if (!c || !sfxBus || sfxLevel() <= 0) return;
    const now = c.currentTime;
    const bus = sfxBus;
    switch (name) {
      case 'count': // countdown beep
        osc(c, bus, 'square', 880, 880, now, 0.09, 0.25);
        break;
      case 'go':
        osc(c, bus, 'square', 1320, 1320, now, 0.3, 0.3);
        osc(c, bus, 'square', 660, 660, now, 0.3, 0.2);
        break;
      case 'bell': // finish bell
        osc(c, bus, 'sine', 1568, 1560, now, 1.4, 0.5);
        osc(c, bus, 'sine', 2093, 2080, now, 0.9, 0.25);
        break;
      case 'box':
        osc(c, bus, 'square', 523, 1046, now, 0.12, 0.2);
        break;
      case 'speed': // whoosh up
        osc(c, bus, 'sawtooth', 300, 1200, now, 0.3, 0.15);
        noiseHit(c, bus, now, 0.3, 0.15, 'highpass', 3000);
        break;
      case 'attack':
        noiseHit(c, bus, now, 0.2, 0.4, 'bandpass', 1200);
        osc(c, bus, 'square', 220, 90, now, 0.18, 0.2);
        break;
      case 'hit': // thud
        osc(c, bus, 'sine', 160, 50, now, 0.25, 0.8);
        noiseHit(c, bus, now, 0.15, 0.4, 'lowpass', 1200);
        break;
      case 'shield':
        osc(c, bus, 'sine', 880, 880, now, 0.35, 0.3);
        osc(c, bus, 'sine', 1320, 1320, now + 0.05, 0.35, 0.2);
        break;
      case 'dud': // boing down
        osc(c, bus, 'triangle', 420, 140, now, 0.35, 0.4);
        break;
      case 'fizzle':
        noiseHit(c, bus, now, 0.15, 0.12, 'highpass', 4000);
        break;
      case 'coin':
        osc(c, bus, 'square', 988, 988, now, 0.07, 0.2);
        osc(c, bus, 'square', 1319, 1319, now + 0.07, 0.14, 0.2);
        break;
      case 'cheer': // crowd swell
        noiseHit(c, bus, now, 0.7, 0.35, 'bandpass', 900);
        break;
    }
  }

  // ---------- speech ----------
  function say(text: string) {
    const synth = globalThis.speechSynthesis;
    const level = voiceLevel();
    if (!synth || !settings?.commentator || level <= 0) return;
    if (queued >= 2) {
      synth.cancel();
      queued = 0;
    }
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US';
    u.rate = 1.15;
    u.volume = level;
    const voice = synth.getVoices().find((v) => v.lang.startsWith('en'));
    if (voice) u.voice = voice;
    const done = () => {
      queued = Math.max(0, queued - 1);
    };
    u.onend = done;
    u.onerror = done;
    queued++;
    synth.speak(u);
  }

  function unlock() {
    if (!Ctor) return;
    try {
      if (!ctx) {
        ctx = new Ctor();
        ensureGraph(ctx);
      }
      if (ctx.state === 'suspended') {
        void ctx
          .resume()
          .then(syncMusic)
          .catch(() => undefined);
      } else {
        syncMusic();
      }
    } catch {
      ctx = null;
    }
  }

  // The first gesture anywhere on the page unlocks audio (browser autoplay rules).
  const hasDocument = !!Ctor && typeof document !== 'undefined';
  const onGesture = () => {
    unlock();
    removeGesture();
  };
  function removeGesture() {
    if (!hasDocument) return;
    document.removeEventListener('pointerdown', onGesture);
    document.removeEventListener('keydown', onGesture);
  }
  if (hasDocument) {
    document.addEventListener('pointerdown', onGesture);
    document.addEventListener('keydown', onGesture);
  }

  return {
    webAudio: !!Ctor,
    unlock,
    apply(next) {
      settings = next;
      applyLevels();
      syncMusic();
    },
    setMusic(theme) {
      desiredTheme = theme;
      syncMusic();
    },
    sfx: playSfx,
    say,
    dispose() {
      removeGesture();
      stopSequencer();
      globalThis.speechSynthesis?.cancel();
      void ctx?.close().catch(() => undefined);
      ctx = null;
      master = null;
      musicBus = null;
      sfxBus = null;
    },
  };
}
