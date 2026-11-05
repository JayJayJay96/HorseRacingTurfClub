import { useState, type CSSProperties } from 'react';
import type { HorseId, Timeline } from '../sim/types.ts';
import { cutinAt, cutinsOf, type CutIn } from './cutins.ts';
import { HorseSprite } from './HorseSprite.tsx';
import { ITEM_INFO } from './items.ts';
import type { ColorsOf } from './Pixel2DRenderer.ts';

/** How long the Thunderclap flash is on screen (the CSS fade is shorter). */
const FLASH_SECONDS = 0.6;

type Props = {
  timeline: Timeline;
  /** Race time in seconds (RaceView's 4 Hz clock). */
  t: number;
  names: Readonly<Record<HorseId, string>>;
  colors: ColorsOf;
};

/**
 * One band. The lag is read once at mount: a 4 Hz tick can land up to 0.25 s late, so the CSS
 * animation starts that far in instead of replaying from the top.
 */
function Band({
  cut,
  t,
  name,
  colors,
}: {
  cut: CutIn;
  t: number;
  name: string;
  colors: ReturnType<ColorsOf>;
}) {
  const [lag] = useState(() => Math.max(0, t - cut.t));
  const info = ITEM_INFO[cut.item];
  const style = { '--silk': colors.silk, animationDelay: `-${lag}s` } as CSSProperties;
  return (
    <div className="cutin" style={style}>
      <HorseSprite colors={colors} size="lg" className="cutin-portrait" />
      <div className="cutin-text">
        <span className="cutin-name">{name}</span>
        <span className="cutin-move">
          {info.icon} {info.name.toUpperCase()}!
        </span>
      </div>
    </div>
  );
}

function Flash({ t0, t }: { t0: number; t: number }) {
  const [lag] = useState(() => Math.max(0, t - t0));
  return <div className="cutin-flash" style={{ animationDelay: `-${lag}s` }} />;
}

/** Big-screen cut-in bands and the Thunderclap flash, over either renderer's canvas. */
export function CutInOverlay({ timeline, t, names, colors }: Props) {
  const cut = cutinAt(cutinsOf(timeline), t);
  const flash = timeline.events.find(
    (e) => e.type === 'pickup' && e.item === 'attack:all' && t >= e.t && t < e.t + FLASH_SECONDS,
  );
  if (!cut && !flash) return null;
  return (
    <div className="cutin-layer" aria-hidden="true">
      {flash && <Flash key={`f${flash.t}`} t0={flash.t} t={t} />}
      {cut && (
        <Band
          key={`c${cut.t}-${cut.horse}`}
          cut={cut}
          t={t}
          name={names[cut.horse] ?? '?'}
          colors={colors(cut.horse, timeline.horses.indexOf(cut.horse))}
        />
      )}
    </div>
  );
}
