import { useEffect, useState, type FormEvent } from 'react';
import {
  BOX_ICON,
  BOX_NAME,
  BOX_TYPES,
  balanceOf,
  boxesOf,
  formatOdds,
  nameOf,
  oddsOf,
  ordinal,
} from '../betting/betting.ts';
import { useSecondsLeft } from '../betting/useSecondsLeft.ts';
import { normalizeCode } from '../lobby/lobby.ts';
import {
  buyBox,
  cancelBet,
  errorText,
  joinRoom,
  placeBet,
  setReady,
  type BetKind,
  type RoomPlayer,
  type RoomState,
} from '../net/rooms.ts';
import { ensureSignedIn } from '../net/supabase.ts';
import { useRoom } from '../net/useRoom.ts';
import { MAX_BOUGHT, PRICES } from '../sim/config.ts';

/** Phone: join the room, then follow its phase. */
export function PlayPage() {
  const code = normalizeCode(new URLSearchParams(window.location.search).get('code') ?? '');
  const [me, setMe] = useState<RoomPlayer | null>(null);
  const [checking, setChecking] = useState(true);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!code) return;
    // join_room returns this device's existing entry before validating the name, so '' probes for a rejoin.
    ensureSignedIn()
      .then(() => joinRoom(code, ''))
      .then(setMe, (e: unknown) => {
        if (!(e instanceof Error && e.message === 'bad_name')) setError(errorText(e));
      })
      .finally(() => setChecking(false));
  }, [code]);

  if (!code) {
    return (
      <main className="play">
        <p role="alert">Missing or invalid room code.</p>
        <a href="/">Home</a>
      </main>
    );
  }
  if (checking) return <main className="play">Loading…</main>;
  if (me) return <PlayRoom code={code} me={me} />;

  const join = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    joinRoom(code, name).then(setMe, (err: unknown) => setError(errorText(err)));
  };

  return (
    <main className="play">
      <h1>Room {code}</h1>
      <form onSubmit={join}>
        <label>
          Your name{' '}
          <input
            value={name}
            maxLength={24}
            autoComplete="nickname"
            onChange={(e) => setName(e.target.value)}
          />
        </label>{' '}
        <button type="submit" className="primary" disabled={!name.trim()}>
          Join
        </button>
      </form>
      {error && <p role="alert">{error}</p>}
    </main>
  );
}

type Act = (fn: () => Promise<unknown>) => void;
type PanelProps = RoomState & { mine: RoomPlayer; balance: number; act: Act };

function PlayRoom({ code, me }: { code: string; me: RoomPlayer }) {
  const { state, error, refresh } = useRoom(code, me.id);
  const [actionError, setActionError] = useState<string | null>(null);

  if (error) {
    return (
      <main className="play">
        <p role="alert">{error}</p>
        <a href="/">Home</a>
      </main>
    );
  }
  if (!state) return <main className="play">Loading…</main>;
  const { room } = state;
  const mine = state.players.find((p) => p.id === me.id);
  if (!mine) {
    return (
      <main className="play">
        <p>You were removed from this room.</p>
        <a href="/">Home</a>
      </main>
    );
  }

  const act: Act = (fn) => {
    setActionError(null);
    fn().then(refresh, (e: unknown) => setActionError(errorText(e)));
  };
  const props: PanelProps = { ...state, mine, balance: balanceOf(state.ledger, mine.id), act };

  return (
    <main className="play">
      <h1>{mine.name}</h1>
      <p>
        Room {room.code} · {room.race_length === 'long' ? 'Long (~3 min)' : 'Short (~2 min)'}
        {room.prize && ` · Prize: ${room.prize}`}
      </p>
      {room.phase === 'LOBBY' && (
        <p>{mine.ticked ? "You're racing today! 🐎" : 'Waiting for the host to tick you in.'}</p>
      )}
      {room.phase === 'SHOP' && <ShopPanel {...props} />}
      {room.phase === 'ODDS_LOCKED' && <p>The shop is closed. Calculating odds…</p>}
      {room.phase === 'BETTING' && <BetPanel {...props} />}
      {room.phase === 'RUNNING' && <RunningPanel endsAt={state.race?.ends_at ?? null} />}
      {room.phase === 'PODIUM' && <ResultPanel {...props} />}
      {(room.phase === 'SHOP' || room.phase === 'BETTING') && (
        <p>
          <button type="button" onClick={() => act(() => setReady(room.id, !mine.ready))}>
            {mine.ready ? 'Ready ✅ (tap to undo)' : "I'm ready"}
          </button>
        </p>
      )}
      {actionError && <p role="alert">{actionError}</p>}
    </main>
  );
}

function ShopPanel({ room, mine, purchases, balance, act }: PanelProps) {
  if (!mine.ticked) {
    return <p>💰 {balance} coins. You're not racing, but you can bet once the odds lock.</p>;
  }
  const boxes = boxesOf(purchases, mine.id);
  return (
    <>
      <p>
        💰 {balance} coins · your boxes:{' '}
        {boxes.length ? boxes.map((b) => BOX_ICON[b]).join(' ') : 'none'} ({boxes.length}/
        {MAX_BOUGHT})
      </p>
      <div className="shop">
        {BOX_TYPES.map((box) => (
          <button
            key={box}
            type="button"
            disabled={boxes.length >= MAX_BOUGHT || balance < PRICES[box]}
            onClick={() => act(() => buyBox(room.id, box))}
          >
            {BOX_ICON[box]} {BOX_NAME[box]} · {PRICES[box]}
          </button>
        ))}
      </div>
      <p>Boxes go in your own lane and open automatically. No refunds.</p>
    </>
  );
}

function BetPanel({ room, players, race, bets, mine, balance, act }: PanelProps) {
  const odds = oddsOf(race);
  const horses = race?.horses ?? [];
  const [horse, setHorse] = useState(horses[0] ?? '');
  const [kind, setKind] = useState<BetKind>('win');
  const [stake, setStake] = useState('10');
  const amount = Number(stake);
  const myBets = bets.filter((b) => b.player_id === mine.id);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    act(() => placeBet(room.id, horse, kind, amount));
  };

  return (
    <>
      <p>💰 {balance} coins</p>
      <form className="shop" onSubmit={submit}>
        <label>
          Horse{' '}
          <select value={horse} onChange={(e) => setHorse(e.target.value)}>
            {horses.map((id) => (
              <option key={id} value={id}>
                {nameOf(players, id)} — Win {formatOdds(odds[id]?.win)} · Place{' '}
                {formatOdds(odds[id]?.place)}
              </option>
            ))}
          </select>
        </label>
        <fieldset>
          <legend>Bet</legend>
          <label>
            <input
              type="radio"
              name="kind"
              checked={kind === 'win'}
              onChange={() => setKind('win')}
            />{' '}
            Win (1st)
          </label>{' '}
          <label>
            <input
              type="radio"
              name="kind"
              checked={kind === 'place'}
              onChange={() => setKind('place')}
            />{' '}
            Place (top 3)
          </label>
        </fieldset>
        <label>
          Stake{' '}
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={balance}
            step={1}
            value={stake}
            onChange={(e) => setStake(e.target.value)}
          />
        </label>
        <button
          type="submit"
          className="primary"
          disabled={!horse || !Number.isInteger(amount) || amount < 1 || amount > balance}
        >
          Bet
        </button>
      </form>
      <h2>Your bets</h2>
      {myBets.length === 0 ? (
        <p>None yet. You can cancel bets until the race starts.</p>
      ) : (
        <ul>
          {myBets.map((b) => (
            <li key={b.id}>
              {b.stake} on {nameOf(players, b.horse_id)} to {b.kind} @ {formatOdds(b.odds)}{' '}
              <button
                type="button"
                aria-label="Cancel bet"
                onClick={() => act(() => cancelBet(b.id))}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function RunningPanel({ endsAt }: { endsAt: string | null }) {
  const left = useSecondsLeft(endsAt);
  return <p>🏇 The race is on! Results in {left} s.</p>;
}

function ResultPanel({ players, race, bets, mine, balance }: PanelProps) {
  const place = (race?.finish_order ?? []).indexOf(mine.id);
  const myBets = bets.filter((b) => b.player_id === mine.id);
  return (
    <>
      {place >= 0 && <p>Your horse finished {ordinal(place + 1)}.</p>}
      {myBets.length > 0 && (
        <ul>
          {myBets.map((b) => (
            <li key={b.id}>
              {b.stake} on {nameOf(players, b.horse_id)} to {b.kind}:{' '}
              {b.payout ? `won ${b.payout}` : 'lost'}
            </li>
          ))}
        </ul>
      )}
      <p>💰 Final balance: {balance} coins</p>
    </>
  );
}
