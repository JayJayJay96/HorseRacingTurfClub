import { useState, type FormEvent } from 'react';
import { setMyHorse, type RoomPlayer } from '../net/rooms.ts';
import { COAT_COLORS, SILK_COLORS } from '../render/palette.ts';

type Act = (fn: () => Promise<unknown>) => void;
type Props = { roomId: string; mine: RoomPlayer; act: Act; busy: boolean };

function Swatches(props: {
  label: string;
  colors: readonly string[];
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  const { label, colors, value, onChange } = props;
  return (
    <fieldset className="swatches">
      <legend>{label}</legend>
      <label>
        <input type="radio" name={label} checked={value === null} onChange={() => onChange(null)} />{' '}
        Lane colour
      </label>
      {colors.map((c, i) => (
        <label key={c}>
          <input
            type="radio"
            name={label}
            checked={value === i}
            onChange={() => onChange(i)}
            aria-label={`${label} ${i + 1}`}
          />
          <span className="silk" style={{ background: c }} />
        </label>
      ))}
    </fieldset>
  );
}

/** Office LOBBY: coat, silk colour and horse name (cosmetic only). */
export function HorsePanel({ roomId, mine, act, busy }: Props) {
  const [coat, setCoat] = useState<number | null>(mine.coat);
  const [silk, setSilk] = useState<number | null>(mine.silk);
  const [name, setName] = useState(mine.horse_name ?? '');
  const save = (e: FormEvent) => {
    e.preventDefault();
    act(() => setMyHorse(roomId, coat, silk, name));
  };
  return (
    <form className="shop" onSubmit={save}>
      <h2>Your horse</h2>
      <Swatches label="Coat" colors={COAT_COLORS} value={coat} onChange={setCoat} />
      <Swatches label="Silks" colors={SILK_COLORS} value={silk} onChange={setSilk} />
      <label>
        Horse name (optional){' '}
        <input
          value={name}
          maxLength={24}
          placeholder={mine.name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <button type="submit" disabled={busy}>
        Save horse
      </button>
    </form>
  );
}
