import { useEffect, useMemo, useState } from 'react';
import { cutinsOf } from '../render/cutins.ts';
import { RaceView } from '../render/RaceView.tsx';
import type { PresetId } from '../render/hd2d/lighting.ts';
import { ITEM_INFO } from '../render/items.ts';
import { HOT, TRAIT_CODES } from '../sim/config.ts';
import { canBeExtended, HOT_ELIGIBLE } from '../sim/hot.ts';
import { COUNTDOWN_SECONDS } from '../sim/playback.ts';
import { createCryptoRng } from '../sim/rng.ts';
import { simulateRace } from '../sim/simulate.ts';
import { fakeTimeline } from '../sim/testTimeline.ts';
import type {
  HotBuff,
  HotItem,
  ItemCode,
  RaceLength,
  Timeline,
  Trait,
  Weather,
} from '../sim/types.ts';
import { BUFF_TEXT, HotStrip, hotText } from './HotItems.tsx';
import { TRAIT_INFO } from './Traits.tsx';
import { TRACKS, type TrackId } from '../render/track.ts';
import { colorsOf } from '../render/palette.ts';
import { COSMETICS, SLOTS, type CosmeticSlot } from '../shop/cosmetics.ts';
import { HorseSprite } from '../render/HorseSprite.tsx';
import { Celebration } from '../track/Podium.tsx';

const SAMPLE_HORSES = [
  'Nasi Lemak Express',
  'Teh Tarik Turbo',
  'Roti Canai Rocket',
  'Kopi O Kid',
  'Satay Sprinter',
  'Durian Dasher',
];
const MOMENTS = [
  { item: 'attack:all', label: 'Thunderclap' },
  { item: 'attack:leader', label: 'Golden Lasso' },
  { item: 'speed:pass3', label: 'Stampede' },
  { item: 'attack:top3', label: 'Hornet Swarm' },
  { item: 'slip', label: 'Slip' },
  { item: 'bump', label: 'Bump' },
] as const;
/** A full 22-horse field for the performance target (spec §4). */
const FULL_FIELD = [...SAMPLE_HORSES, ...Array.from({ length: 16 }, (_, i) => `Extra ${i + 1}`)];

/** Runs the engine locally with a crypto seed and plays it back; no Supabase needed. */
export function Sandbox() {
  const [run, setRun] = useState<{ timeline: Timeline; gun: number; at?: number } | null>(null);
  const [freeze, setFreeze] = useState<'' | 'band' | 'effect'>('');
  const [trackId, setTrackId] = useState<TrackId>('oval');
  const [looks, setLooks] = useState<Record<CosmeticSlot, string>>({
    pattern: '',
    trail: '',
    cap: '',
    celebration: '',
  });
  const [field, setField] = useState<6 | 22>(6);
  const [preset, setPreset] = useState<PresetId | ''>('');
  const [weather, setWeather] = useState<Weather>('clear');
  const [hot, setHot] = useState<HotItem[]>([]);
  const [trait, setTrait] = useState<Trait>('normal');
  // Lane 1 (the horse with the three bought boxes) runs the picked trait.
  const extras = { hot, traits: { [SAMPLE_HORSES[0]!]: trait } };
  const [lookTest, setLookTest] = useState(false);
  const [frameMs, setFrameMs] = useState(0);
  const horses = field === 6 ? SAMPLE_HORSES : FULL_FIELD;
  // Lane 0 wears the picked looks, so each pattern, trail and cap can be checked by eye.
  const colors = useMemo(
    () => (_horse: string, lane: number) =>
      lane === 0 ? { ...colorsOf(0), ...looks } : colorsOf(lane),
    [looks],
  );
  const names = useMemo(() => Object.fromEntries(FULL_FIELD.map((h) => [h, h])), []);
  // Look test: 6 horses on the home straight, frozen (leader 100 m out at t = 170 s).
  const lookRun = useMemo(() => {
    const speeds = Object.fromEntries(SAMPLE_HORSES.map((h, i) => [h, 10 - i * 0.03] as const));
    return { timeline: fakeTimeline(speeds, 1800), gun: 0 };
  }, []);
  // Freeze a Moment mid-band (0.6 s in) or on its in-race effect (1.6 s in).
  const momentAt = run?.at;
  const look = useMemo(() => {
    const frozen = lookTest
      ? 170
      : freeze && momentAt !== undefined
        ? momentAt + (freeze === 'band' ? 0.6 : 1.6)
        : undefined;
    return { ...(frozen === undefined ? {} : { freezeT: frozen }), ...(preset ? { preset } : {}) };
  }, [lookTest, preset, freeze, momentAt]);
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const id = setInterval(
      () => setFrameMs((globalThis as { hd2dFrameMs?: number }).hd2dFrameMs ?? 0),
      500,
    );
    return () => clearInterval(id);
  }, []);
  const start = (length: RaceLength) =>
    setRun({
      timeline: simulateRace({
        seed: createCryptoRng().nextInt(2 ** 32),
        horses,
        bought: { [SAMPLE_HORSES[0]!]: ['speed', 'attack', 'defense'] },
        length,
        weather,
        ...extras,
      }),
      gun: Date.now() + COUNTDOWN_SECONDS * 1000,
    });
  // Jump to 4 s before a special moment (spec 2026-11-05): the first seed that has one.
  const moment = (item: (typeof MOMENTS)[number]['item']) => {
    for (let seed = 1; seed <= 5000; seed++) {
      const w = item === 'slip' ? 'rain' : item === 'bump' ? 'fog' : weather;
      const timeline = simulateRace({
        seed,
        horses,
        bought: {},
        length: 'short',
        weather: w,
        ...extras,
      });
      const at =
        item === 'slip' || item === 'bump'
          ? timeline.events.find((e) => e.type === item && e.t > 6)?.t
          : item === 'attack:top3'
            ? timeline.events.find((e) => e.type === 'pickup' && e.item === item && e.t > 6)?.t
            : cutinsOf(timeline).find((c) => c.item === item && c.t > 6)?.t;
      if (at !== undefined) {
        setRun({ timeline, gun: Date.now() - (at - 4) * 1000, at });
        return;
      }
    }
  };
  const shown = lookTest ? lookRun : run;

  return (
    <main className="track">
      <h1>Horse Racing Turf Club · sandbox</h1>
      <p>
        <button type="button" onClick={() => start('short')}>
          Run short race
        </button>{' '}
        <button type="button" onClick={() => start('long')}>
          Run long race
        </button>
        <label>
          {' '}
          Track{' '}
          <select value={trackId} onChange={(e) => setTrackId(e.target.value as TrackId)}>
            {Object.values(TRACKS).map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {' '}
          Horses{' '}
          <select value={field} onChange={(e) => setField(Number(e.target.value) === 22 ? 22 : 6)}>
            <option value={6}>6</option>
            <option value={22}>22</option>
          </select>
        </label>
        {SLOTS.map((slot) => (
          <label key={slot}>
            {' '}
            Lane 1 {slot}{' '}
            <select
              value={looks[slot]}
              onChange={(e) => setLooks({ ...looks, [slot]: e.target.value })}
            >
              <option value="">None</option>
              {COSMETICS.filter((c) => c.slot === slot).map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        ))}
        <label>
          {' '}
          Light{' '}
          <select value={preset} onChange={(e) => setPreset(e.target.value as PresetId | '')}>
            <option value="">From seed</option>
            <option value="afternoon">Afternoon</option>
            <option value="sunset">Sunset</option>
            <option value="night">Night</option>
          </select>
        </label>
        <label>
          {' '}
          Weather{' '}
          <select value={weather} onChange={(e) => setWeather(e.target.value as Weather)}>
            <option value="clear">Clear</option>
            <option value="rain">Rain</option>
            <option value="fog">Fog</option>
          </select>
        </label>{' '}
        <label>
          {' '}
          Hot item{' '}
          <select
            value=""
            onChange={(e) => {
              const [item, buff] = e.target.value.split('|') as [ItemCode, HotBuff];
              if (hot.length < HOT.count && !hot.some((x) => x.item === item))
                setHot([...hot, { item, buff }]);
            }}
          >
            <option value="">Add…</option>
            {HOT_ELIGIBLE.flatMap((item) =>
              (['lucky', 'extended'] as const)
                .filter((buff) => buff === 'lucky' || canBeExtended(item))
                .map((buff) => (
                  <option key={`${item}|${buff}`} value={`${item}|${buff}`}>
                    {ITEM_INFO[item].name} {BUFF_TEXT[buff]}
                  </option>
                )),
            )}
          </select>
        </label>{' '}
        {hot.length > 0 && (
          <button type="button" onClick={() => setHot([])}>
            Clear hot ({hotText(hot)})
          </button>
        )}
        <label>
          {' '}
          Lane 1 trait{' '}
          <select value={trait} onChange={(e) => setTrait(e.target.value as Trait)}>
            {TRAIT_CODES.map((t) => (
              <option key={t} value={t}>
                {TRAIT_INFO[t].icon} {TRAIT_INFO[t].name}
              </option>
            ))}
          </select>
        </label>{' '}
        <button type="button" aria-pressed={lookTest} onClick={() => setLookTest(!lookTest)}>
          Look test
        </button>{' '}
        Moment:{' '}
        <select
          aria-label="Freeze moment"
          value={freeze}
          onChange={(e) => setFreeze(e.target.value as '' | 'band' | 'effect')}
        >
          <option value="">Play</option>
          <option value="band">Freeze on band</option>
          <option value="effect">Freeze on effect</option>
        </select>{' '}
        {MOMENTS.map((m) => (
          <button key={m.item} type="button" onClick={() => moment(m.item)}>
            {m.label}
          </button>
        ))}
        {run &&
          !lookTest &&
          ` Seed ${run.timeline.seed} · ${run.timeline.events.length} events · ${run.timeline.weather ?? 'clear'}`}
        {import.meta.env.DEV && frameMs > 0 && ` · ${frameMs.toFixed(1)} ms/frame`}
      </p>
      {/* Lane 1 as the podium winner, wearing the picked cap and celebration. */}
      <section className="podium-stage sandbox-podium" aria-label="Podium preview">
        <ol className="podium">
          <li>
            <span className="podium-horse">
              <Celebration code={looks.celebration || null}>
                <HorseSprite colors={{ ...colorsOf(0), ...looks }} size="lg" animated />
              </Celebration>
            </span>
            {SAMPLE_HORSES[0]}
          </li>
        </ol>
      </section>
      {shown && <HotStrip hot={shown.timeline.hot} />}
      {shown && (
        <RaceView
          key={`${shown.gun}-${lookTest}`}
          timeline={shown.timeline}
          startAtMs={shown.gun}
          names={names}
          track={TRACKS[trackId]}
          colors={colors}
          look={look}
        />
      )}
    </main>
  );
}
