import { traitLabel } from '../app/Traits.tsx';
import { TRAIT_CODES } from '../sim/config.ts';
import type { Trait } from '../sim/types.ts';

/** The phone's per-race trait pick (spec D): saves on tap, the current pick pressed. */
export function TraitPicker(props: {
  current: Trait;
  disabled: boolean;
  onPick: (trait: Trait) => void;
}) {
  return (
    <fieldset className="trait-pick">
      <legend>Your trait</legend>
      {TRAIT_CODES.map((t) => (
        <button
          key={t}
          type="button"
          className="card"
          aria-pressed={props.current === t}
          disabled={props.disabled}
          onClick={() => props.onPick(t)}
        >
          {traitLabel(t)}
        </button>
      ))}
    </fieldset>
  );
}
