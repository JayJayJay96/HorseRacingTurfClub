/** Id of the bet slip form, so the bar's Bet button can submit it from outside. */
export const BET_FORM = 'bet-slip';

/**
 * The phase's main phone actions pinned to the bottom (spec 2026-11-05 polish section 4): I'm
 * ready in the shop; Bet and I'm ready while betting. Sticky in the flow, so nothing ends up
 * under it.
 */
export function ActionBar(props: {
  ready: boolean;
  busy: boolean;
  onReady: () => void;
  bet?: { disabled: boolean };
}) {
  return (
    <div className="action-bar">
      {props.bet && (
        <button type="submit" form={BET_FORM} className="primary" disabled={props.bet.disabled}>
          Bet
        </button>
      )}
      <button
        type="button"
        className={props.bet ? undefined : 'primary'}
        disabled={props.busy}
        onClick={props.onReady}
      >
        {props.ready ? 'Ready ✅ (tap to undo)' : "I'm ready"}
      </button>
    </div>
  );
}
