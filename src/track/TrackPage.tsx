import { useEffect, useMemo, useRef, useState, type ComponentType, type FormEvent } from 'react';
import {
  BOX_ICON,
  BOX_NAME,
  BOX_TYPES,
  boxesOf,
  canPlace,
  formatOdds,
  horseName,
  horseNameOf,
  nameOf,
  oddsOf,
  potOf,
} from '../betting/betting.ts';
import { useSecondsLeft } from '../betting/useSecondsLeft.ts';
import { canOpenShop, joinUrl, OFFICE_CODE } from '../lobby/lobby.ts';
import {
  addPlayer,
  errorText,
  finishRace,
  lockOdds,
  removePlayer,
  setPhase,
  setTicked,
  setPrize as savePrizeRpc,
  setRaceLength,
  startRace,
  type RoomPlayer,
  type RoomState,
} from '../net/rooms.ts';
import { useRoom } from '../net/useRoom.ts';
import { useTimeline } from '../net/useTimeline.ts';
import { colorsByPlayer } from '../render/palette.ts';
import { RaceView, Silk } from '../render/RaceView.tsx';
import { MAX_HORSES, PRICES } from '../sim/config.ts';
import { gunMs } from '../sim/playback.ts';
import type { RaceLength } from '../sim/types.ts';
import { JoinQr } from './JoinQr.tsx';
import { OfficeHostLogin } from './OfficeHostLogin.tsx';

type Act = (fn: () => Promise<unknown>) => void;
type BoardProps = RoomState & { online: ReadonlySet<string>; act: Act; busy: boolean };

const LENGTH_LABEL: Record<RaceLength, string> = { short: 'Short (~2 min)', long: 'Long (~3 min)' };

/** Big screen for the host device. */
export function TrackPage() {
  const code = new URLSearchParams(window.location.search).get('code') ?? '';
  const { state, online, error, refresh } = useRoom(code);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Not the host (or the screen was taken over elsewhere): the office unlocks with the admin password.
  if (error && code === OFFICE_CODE) return <OfficeHostLogin />;
  if (error) {
    return (
      <main className="track">
        <p role="alert">{error}</p>
        <a href="/">Home</a>
      </main>
    );
  }
  if (!state) return <main className="track">Loading…</main>;

  const act: Act = (fn) => {
    setActionError(null);
    setBusy(true);
    fn()
      .then(refresh, (e: unknown) => setActionError(errorText(e)))
      .finally(() => setBusy(false));
  };
  const Board = BOARDS[state.room.phase];

  return (
    <main className="track">
      {Board ? (
        <Board {...state} online={online} act={act} busy={busy} />
      ) : (
        <p>Phase: {state.room.phase}</p>
      )}
      {actionError && <p role="alert">{actionError}</p>}
    </main>
  );
}

function LobbyBoard({ room, players, balances, online, act }: BoardProps) {
  const office = room.kind === 'office';
  const [name, setName] = useState('');
  const [prize, setPrize] = useState(room.prize);
  const length = room.race_length as RaceLength;
  const ticked = players.filter((p) => p.ticked).length;

  const add = (e: FormEvent) => {
    e.preventDefault();
    act(() => addPlayer(room.id, name).then(() => setName('')));
  };
  const savePrize = () => {
    if (prize !== room.prize) act(() => savePrizeRpc(room.id, prize));
  };

  return (
    <div className="lobby">
      <section>
        <JoinQr url={joinUrl(window.location.origin, room.code)} />
        <p className="code">{room.code}</p>
        <p>Scan, or open {window.location.host}/play and enter the code.</p>
      </section>
      <section>
        <fieldset>
          <legend>Race length</legend>
          {(['short', 'long'] as const).map((l) => (
            <label key={l}>
              <input
                type="radio"
                name="length"
                checked={length === l}
                onChange={() => act(() => setRaceLength(room.id, l))}
              />{' '}
              {LENGTH_LABEL[l]}{' '}
            </label>
          ))}
        </fieldset>
        <label>
          Prize{' '}
          <input
            value={prize}
            maxLength={60}
            placeholder="e.g. Winner picks lunch"
            onChange={(e) => setPrize(e.target.value)}
            onBlur={savePrize}
          />
        </label>

        <h2>
          Roster ({ticked}/{MAX_HORSES} racing)
        </h2>
        <ul className="roster">
          {players.map((p) => (
            <li key={p.id}>
              <label>
                <input
                  type="checkbox"
                  checked={p.ticked}
                  onChange={(e) => act(() => setTicked(p.id, e.target.checked))}
                />{' '}
                {p.name}
              </label>
              {office && <span>💰 {balances[p.id] ?? 0}</span>}
              {p.uid && <span>{online.has(p.id) ? '📱 online' : '📴 offline'}</span>}
              {!office && (
                <button
                  type="button"
                  aria-label={`Remove ${p.name}`}
                  onClick={() => act(() => removePlayer(p.id))}
                >
                  ✕
                </button>
              )}
            </li>
          ))}
        </ul>
        {office ? (
          <p>
            People, PINs and coins are managed at <a href="/admin">/admin</a>.
          </p>
        ) : (
          <form onSubmit={add}>
            <input
              aria-label="Name"
              placeholder="Add a name (no phone)"
              value={name}
              maxLength={24}
              onChange={(e) => setName(e.target.value)}
            />{' '}
            <button type="submit" disabled={!name.trim()}>
              Add
            </button>
          </form>
        )}
        <p>
          <button
            type="button"
            className="primary"
            disabled={!canOpenShop(players)}
            onClick={() => act(() => setPhase(room.id, 'SHOP'))}
          >
            Open shop
          </button>
        </p>
      </section>
    </div>
  );
}

const boxIcons = (purchases: RoomState['purchases'], playerId: string) =>
  boxesOf(purchases, playerId)
    .map((b) => BOX_ICON[b])
    .join(' ');

function ReadyLine({ players }: { players: RoomPlayer[] }) {
  const phones = players.filter((p) => p.uid);
  return (
    <p>
      Ready: {phones.filter((p) => p.ready).length}/{phones.length}
    </p>
  );
}

function ShopBoard({ room, players, purchases, online, act, busy }: BoardProps) {
  return (
    <section>
      <h1>Shop open · room {room.code}</h1>
      <p>
        Phones: up to 3 boxes for your own lane —{' '}
        {BOX_TYPES.map((b) => `${BOX_ICON[b]} ${BOX_NAME[b]} ${PRICES[b]}`).join(' · ')}
      </p>
      <ReadyLine players={players} />
      <ul className="roster">
        {players
          .filter((p) => p.ticked)
          .map((p) => (
            <li key={p.id}>
              🐎 {horseName(p)} {boxIcons(purchases, p.id)}
              {p.uid && !online.has(p.id) && ' (offline)'}
            </li>
          ))}
      </ul>
      <p>
        <button type="button" disabled={busy} onClick={() => act(() => setPhase(room.id, 'LOBBY'))}>
          Back to lobby (cancels purchases)
        </button>{' '}
        <button
          type="button"
          className="primary"
          disabled={busy}
          onClick={() => act(() => lockOdds(room.id))}
        >
          Lock odds
        </button>
      </p>
    </section>
  );
}

function OddsLockedBoard({ room, act, busy }: BoardProps) {
  return (
    <section>
      <h1>Calculating odds…</h1>
      <p>The shop is closed.</p>
      {/* Only needed if a calculation failed; lock-odds treats ODDS_LOCKED as a retry. */}
      <button type="button" disabled={busy} onClick={() => act(() => lockOdds(room.id))}>
        Retry
      </button>
    </section>
  );
}

function BettingBoard({ room, players, race, purchases, bets, act, busy }: BoardProps) {
  const odds = oddsOf(race);
  const horses = race?.horses ?? [];
  return (
    <section>
      <h1>Place your bets · room {room.code}</h1>
      <table className="odds">
        <thead>
          <tr>
            <th>Horse</th>
            <th>Boxes</th>
            <th>Win</th>
            {canPlace(horses) && <th>Place</th>}
          </tr>
        </thead>
        <tbody>
          {horses.map((id) => (
            <tr key={id}>
              <td>{horseNameOf(players, id)}</td>
              <td>{boxIcons(purchases, id)}</td>
              <td>{formatOdds(odds[id]?.win)}</td>
              {canPlace(horses) && <td>{formatOdds(odds[id]?.place)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        Bought boxes change a horse's chances. Pot: {potOf(bets)} coins in {bets.length}{' '}
        {bets.length === 1 ? 'bet' : 'bets'}.
      </p>
      <ReadyLine players={players} />
      <button
        type="button"
        className="primary"
        disabled={busy}
        onClick={() => act(() => startRace(room.id))}
      >
        Start race
      </button>
    </section>
  );
}

function RunningBoard({ room, players, race, act, busy }: BoardProps) {
  const left = useSecondsLeft(race?.ends_at ?? null);
  const { timeline, error } = useTimeline(race?.id ?? null);
  const names = useMemo(
    () => Object.fromEntries(players.map((p) => [p.id, horseName(p)])),
    [players],
  );
  const colors = useMemo(() => colorsByPlayer(players), [players]);
  const asked = useRef(false);
  const retry = useRef(0);
  useEffect(() => () => clearTimeout(retry.current), []);
  useEffect(() => {
    if (left > 0 || asked.current) return;
    asked.current = true;
    // The browser clock can run ahead of the DB: retry while the server says not yet.
    const tryFinish = () =>
      act(() =>
        finishRace(room.id).catch((e: unknown) => {
          if (!(e instanceof Error && e.message === 'race_not_finished')) throw e;
          retry.current = window.setTimeout(tryFinish, 2000);
        }),
      );
    tryFinish();
  }, [left, act, room.id]);
  return (
    <section>
      {timeline && race?.started_at ? (
        <RaceView
          timeline={timeline}
          startAtMs={gunMs(race.started_at)}
          names={names}
          colors={colors}
        />
      ) : (
        <p>{error ?? 'Loading the race…'}</p>
      )}
      {left === 0 && (
        <button type="button" disabled={busy} onClick={() => act(() => finishRace(room.id))}>
          Show results
        </button>
      )}
    </section>
  );
}

function PodiumBoard({ room, players, race, bets, act, busy }: BoardProps) {
  const { timeline } = useTimeline(race?.id ?? null);
  const top3 = (race?.finish_order ?? []).slice(0, 3);
  const winners = bets
    .filter((b) => (b.payout ?? 0) > 0)
    .sort((a, b) => (b.payout ?? 0) - (a.payout ?? 0));
  const best = winners[0];
  return (
    <section>
      <h1>Results</h1>
      <ol className="podium">
        {top3.map((id) => (
          <li key={id}>
            <Silk color={colorsByPlayer(players)(id, (race?.horses ?? []).indexOf(id)).silk} />{' '}
            {horseNameOf(players, id)}
            {timeline && ` · ${timeline.finishTimes[id]?.toFixed(2)} s`}
          </li>
        ))}
      </ol>
      {race?.prize && top3.length > 0 && (
        <p>
          🏆 {horseNameOf(players, top3[0])}: {race.prize}
        </p>
      )}
      <h2>Payouts</h2>
      {best && (
        <p>
          🎉 Biggest win: {nameOf(players, best.player_id)} won {best.payout} on{' '}
          {horseNameOf(players, best.horse_id)}
        </p>
      )}
      {winners.length === 0 ? (
        <p>No winning bets.</p>
      ) : (
        <ul>
          {winners.map((b) => (
            <li key={b.id}>
              {nameOf(players, b.player_id)} won {b.payout} on {horseNameOf(players, b.horse_id)} (
              {b.kind})
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        className="primary"
        disabled={busy}
        onClick={() => act(() => setPhase(room.id, 'LOBBY'))}
      >
        Next race
      </button>
    </section>
  );
}

const BOARDS: Record<string, ComponentType<BoardProps> | undefined> = {
  LOBBY: LobbyBoard,
  SHOP: ShopBoard,
  ODDS_LOCKED: OddsLockedBoard,
  BETTING: BettingBoard,
  RUNNING: RunningBoard,
  PODIUM: PodiumBoard,
};
