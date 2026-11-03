import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  BOX_ICON,
  BOX_NAME,
  BOX_TYPES,
  boxesOf,
  canPlace,
  formatOdds,
  horseNameOf,
  oddsOf,
  ordinal,
} from '../betting/betting.ts';
import { phoneAnnouncement } from '../app/announce.ts';
import { TopBar } from '../app/TopBar.tsx';
import { BADGES, formatForm } from '../history/badges.ts';
import { soundEngine, useAudioSettings } from '../audio/sound.ts';
import { SoundToggle } from '../audio/SoundToggle.tsx';
import { useRaceAudio } from '../audio/useRaceAudio.ts';
import { normalizeCode } from '../lobby/lobby.ts';
import {
  buyBox,
  cancelBet,
  errorText,
  joinRoom,
  officeLogout,
  placeBet,
  privateRoster,
  setReady,
  type BetKind,
  type RoomPlayer,
  type RoomState,
} from '../net/rooms.ts';
import { CHEER_GAP_MS, CHEERS, sendCheer, useCheers, type CheerEmoji } from '../net/cheers.ts';
import { useOfficeStats, type OfficeStats } from '../net/stats.ts';
import { ensureSignedIn } from '../net/supabase.ts';
import { useRoom } from '../net/useRoom.ts';
import { useTimeline } from '../net/useTimeline.ts';
import { colorsByPlayer } from '../render/palette.ts';
import { trackById } from '../render/track.ts';
import { useRaceTime } from '../render/useRaceTime.ts';
import { MAX_BOUGHT, PRICES } from '../sim/config.ts';
import { gunMs, standingsAt } from '../sim/playback.ts';
import { HorsePanel } from './HorsePanel.tsx';
import { MiniOval } from './MiniOval.tsx';
import { OfficeLogin } from './OfficeLogin.tsx';

/** Coin sound after a successful buy or bet; a sound problem must never look like a failed action. */
function playCoin() {
  try {
    soundEngine().sfx('coin');
  } catch {
    // sound is best effort
  }
}

/** Phone: join the room, then follow its phase. */
export function PlayPage() {
  const code = normalizeCode(new URLSearchParams(window.location.search).get('code') ?? '');
  const [me, setMe] = useState<RoomPlayer | null>(null);
  const [checking, setChecking] = useState(true);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [office, setOffice] = useState(false);
  const [roster, setRoster] = useState<{ name: string; ticked: boolean }[]>([]);

  useEffect(() => {
    if (!code) return;
    // join_room returns this device's existing entry before validating the name, so '' probes for a rejoin.
    ensureSignedIn()
      .then(() => joinRoom(code, ''))
      .then(setMe, async (e: unknown) => {
        const reason = e instanceof Error ? e.message : '';
        if (reason === 'office_room') return setOffice(true);
        // Not joined yet: offer the names the host pre-entered (claimable until Start).
        const names = (await privateRoster(code).catch(() => null)) ?? [];
        setRoster(names);
        // After the lobby only a pre-entered name can join, so say so when there is none.
        if (reason !== 'bad_name' && !names.length) setError(errorText(e));
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
  if (office) return <OfficeLogin onLogin={setMe} />;

  const claim = (n: string) => {
    setError(null);
    joinRoom(code, n).then(setMe, (err: unknown) => {
      setError(errorText(err));
      // Another phone may have just taken that name: refresh the list.
      void privateRoster(code).then(
        (names) => setRoster(names ?? []),
        () => {},
      );
    });
  };
  const join = (e: FormEvent) => {
    e.preventDefault();
    claim(name);
  };

  return (
    <main className="play">
      <h1>Room {code}</h1>
      {roster.length > 0 && (
        <>
          <h2>Pre-entered by the host</h2>
          <ul className="pick">
            {roster.map((p) => (
              <li key={p.name}>
                <button type="button" className="primary" onClick={() => claim(p.name)}>
                  I'm {p.name}
                  {p.ticked && ' 🐎 racing'}
                </button>
              </li>
            ))}
          </ul>
          <h2>Or join with a new name</h2>
        </>
      )}
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
type PanelProps = RoomState & { mine: RoomPlayer; balance: number; act: Act; busy: boolean };

function PlayRoom({ code, me }: { code: string; me: RoomPlayer }) {
  const { state, error, refresh } = useRoom(code, me.id);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inflight = useRef(false);
  // Before the early returns: hooks run every render; it only fetches in the office.
  // Only the office LOBBY shows the record, so phones don't all fetch stats on every phase change.
  const { stats } = useOfficeStats(
    state?.room.phase,
    state?.room.kind === 'office' && state.room.phase === 'LOBBY',
  );
  const { settings, update } = useAudioSettings('phone');

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
  if (mine.uid !== me.uid) {
    return (
      <main className="play">
        <p>You signed in on another phone.</p>
        <button type="button" onClick={() => window.location.reload()}>
          Sign in here
        </button>
      </main>
    );
  }

  const act: Act = (fn) => {
    if (inflight.current) return;
    inflight.current = true;
    setActionError(null);
    setBusy(true);
    fn()
      .then(refresh, (e: unknown) => setActionError(errorText(e)))
      .finally(() => {
        inflight.current = false;
        setBusy(false);
      });
  };
  const props: PanelProps = {
    ...state,
    mine,
    balance: state.balances[mine.id] ?? 0,
    act,
    busy,
  };
  // Derived text: a refetch renders the same string, so React leaves the DOM (and the reader) alone.
  const announcement = phoneAnnouncement(
    room.phase,
    room.phase === 'PODIUM' ? (state.race?.finish_order ?? []).indexOf(mine.id) : -1,
    state.bets.filter((b) => b.player_id === mine.id).reduce((sum, b) => sum + (b.payout ?? 0), 0),
  );

  return (
    <main className="play">
      <p className="visually-hidden" role="status" aria-live="polite">
        {announcement}
      </p>
      <TopBar code={room.code} coins={props.balance}>
        <SoundToggle settings={settings} update={update} />
      </TopBar>
      <h1>{mine.name}</h1>
      <p>
        Room {room.code} · {room.race_length === 'long' ? 'Long (~3 min)' : 'Short (~2 min)'}
        {room.prize && ` · Prize: ${room.prize}`}
      </p>
      {room.phase === 'LOBBY' && (
        <p>{mine.ticked ? "You're racing today! 🐎" : 'Waiting for the host to tick you in.'}</p>
      )}
      {room.kind === 'office' && room.phase === 'LOBBY' && (
        <>
          <p>💰 {props.balance} coins</p>
          <MyRecord stats={stats} id={mine.id} />
          <HorsePanel roomId={room.id} mine={mine} balance={props.balance} act={act} busy={busy} />
          <p>
            <button
              type="button"
              disabled={busy}
              onClick={() => act(() => officeLogout(room.id).then(() => window.location.reload()))}
            >
              Not you? Switch person
            </button>
          </p>
        </>
      )}
      {room.phase === 'SHOP' && <ShopPanel {...props} />}
      {room.phase === 'ODDS_LOCKED' && <p>The shop is closed. Calculating odds…</p>}
      {room.phase === 'BETTING' && <BetPanel {...props} />}
      {room.phase === 'RUNNING' && <RunningPanel {...props} />}
      {room.phase === 'PODIUM' && <ResultPanel {...props} />}
      {(room.phase === 'SHOP' || room.phase === 'BETTING') && (
        <p>
          <button
            type="button"
            disabled={busy}
            onClick={() => act(() => setReady(room.id, !mine.ready))}
          >
            {mine.ready ? 'Ready ✅ (tap to undo)' : "I'm ready"}
          </button>
        </p>
      )}
      {actionError && <p role="alert">{actionError}</p>}
    </main>
  );
}

function MyRecord({ stats, id }: { stats: OfficeStats | null; id: string }) {
  const record = stats?.horses.find((h) => h.id === id);
  const badges = stats?.badges.filter((b) => b.id === id) ?? [];
  return (
    <>
      {record && (
        <p>
          Your record: {record.races} {record.races === 1 ? 'race' : 'races'} · {record.wins}{' '}
          {record.wins === 1 ? 'win' : 'wins'} · form {formatForm(record.last5)}
        </p>
      )}
      {badges.length > 0 && (
        <ul className="badges">
          {badges.map((b) => (
            <li key={b.badge}>
              {BADGES[b.badge].icon} {BADGES[b.badge].name}
              <small> · {BADGES[b.badge].description}</small>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function ShopPanel({ room, mine, purchases, balance, act, busy }: PanelProps) {
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
            disabled={busy || boxes.length >= MAX_BOUGHT || balance < PRICES[box]}
            onClick={() => act(() => buyBox(room.id, box).then(playCoin))}
          >
            {BOX_ICON[box]} {BOX_NAME[box]} · {PRICES[box]}
          </button>
        ))}
      </div>
      <p>Boxes go in your own lane and open automatically. No refunds.</p>
    </>
  );
}

function BetPanel({ room, players, race, bets, mine, balance, act, busy }: PanelProps) {
  const odds = oddsOf(race);
  const horses = race?.horses ?? [];
  const [pick, setPick] = useState('');
  const horse = horses.includes(pick) ? pick : (horses[0] ?? '');
  const [choice, setChoice] = useState<BetKind>('win');
  const kind = canPlace(horses) ? choice : 'win';
  const [stake, setStake] = useState('10');
  const amount = Number(stake);
  const myBets = bets.filter((b) => b.player_id === mine.id);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    act(() => placeBet(room.id, horse, kind, amount).then(playCoin));
  };

  return (
    <>
      <p>💰 {balance} coins</p>
      <form className="shop" onSubmit={submit}>
        <label>
          Horse{' '}
          <select value={horse} onChange={(e) => setPick(e.target.value)}>
            {horses.map((id) => (
              <option key={id} value={id}>
                {horseNameOf(players, id)} — Win {formatOdds(odds[id]?.win)}
                {canPlace(horses) && ` · Place ${formatOdds(odds[id]?.place)}`}
              </option>
            ))}
          </select>
        </label>
        <fieldset>
          <legend>Bet</legend>
          <label htmlFor="kind-win">
            <input
              id="kind-win"
              type="radio"
              name="kind"
              value="win"
              checked={kind === 'win'}
              onChange={() => setChoice('win')}
            />{' '}
            Win (1st)
          </label>{' '}
          {canPlace(horses) && (
            <label htmlFor="kind-place">
              <input
                id="kind-place"
                type="radio"
                name="kind"
                value="place"
                checked={kind === 'place'}
                onChange={() => setChoice('place')}
              />{' '}
              Place (top 3)
            </label>
          )}
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
          disabled={busy || !horse || !Number.isInteger(amount) || amount < 1 || amount > balance}
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
              {b.stake} on {horseNameOf(players, b.horse_id)} to {b.kind} @ {formatOdds(b.odds)}{' '}
              <button
                type="button"
                aria-label={`Cancel ${b.stake} bet on ${horseNameOf(players, b.horse_id)}`}
                disabled={busy}
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

function RunningPanel({ room, players, race, bets, mine }: PanelProps) {
  const { timeline, error } = useTimeline(race?.id ?? null);
  const gun = race?.started_at ? gunMs(race.started_at) : 0;
  const t = useRaceTime(gun);
  useRaceAudio(timeline, gun, { cues: (c) => c === 'count' || c === 'go' || c === 'bell' });
  const shown = useCheers(room.id, new Set(players.map((p) => p.id)));
  const [cooling, setCooling] = useState(false);
  const coolTimer = useRef(0);
  useEffect(() => () => clearTimeout(coolTimer.current), []);
  if (!timeline || !race?.started_at) return <p>{error ?? 'Loading the race…'}</p>;
  const order = standingsAt(timeline, t);
  const last = Math.max(...Object.values(timeline.finishTimes));
  const myBets = bets.filter((b) => b.player_id === mine.id);
  const cheer = (emoji: CheerEmoji) => {
    sendCheer(room.id, { player: mine.id, emoji }).catch(() => {}); // best effort
    setCooling(true);
    coolTimer.current = window.setTimeout(() => setCooling(false), CHEER_GAP_MS);
  };
  return (
    <>
      <p>
        {t < 0
          ? `🏁 Starting in ${Math.ceil(-t)}…`
          : t > last
            ? 'All home! Results in a moment…'
            : "🏇 And they're off!"}
        {timeline.horses.includes(mine.id) && ` You're #${timeline.horses.indexOf(mine.id) + 1}.`}
      </p>
      <MiniOval
        timeline={timeline}
        t={t}
        mine={mine.id}
        colors={colorsByPlayer(players)}
        track={trackById(race.track)}
      />
      {shown.length > 0 && (
        <p aria-hidden="true">
          {shown
            .map((c) => `${c.emoji} ${players.find((p) => p.id === c.player)?.name ?? '?'}`)
            .join('  ')}
        </p>
      )}
      {t >= 0 && t <= last && (
        <p className="cheer-row">
          Cheer!{' '}
          {CHEERS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              aria-label={`Cheer ${emoji}`}
              disabled={cooling}
              onClick={() => cheer(emoji)}
            >
              {emoji}
            </button>
          ))}
        </p>
      )}
      {t >= 0 && timeline.horses.includes(mine.id) && (
        <p>You: {ordinal(order.indexOf(mine.id) + 1)}</p>
      )}
      {t >= 0 && myBets.length > 0 && (
        <ul>
          {myBets.map((b) => {
            const place = order.indexOf(b.horse_id);
            const winning = place >= 0 && (b.kind === 'win' ? place === 0 : place < 3);
            return (
              <li key={b.id}>
                {winning ? '✅' : '⏳'} {b.stake} on {horseNameOf(players, b.horse_id)} to {b.kind}:{' '}
                {ordinal(place + 1)} now
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
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
              {b.stake} on {horseNameOf(players, b.horse_id)} to {b.kind}:{' '}
              {b.payout ? `won ${b.payout}` : 'lost'}
            </li>
          ))}
        </ul>
      )}
      <p>💰 Final balance: {balance} coins</p>
    </>
  );
}
