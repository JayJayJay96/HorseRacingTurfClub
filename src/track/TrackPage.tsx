import { useEffect, useMemo, useRef, useState, type ComponentType, type FormEvent } from 'react';
import {
  BOX_ICON,
  BOX_NAME,
  BOX_TYPES,
  betOn,
  boxesOf,
  canPlace,
  formatOdds,
  GROUP_NAME,
  groupOddsOf,
  horseName,
  horseNameOf,
  nameOf,
  oddsOf,
  potOf,
} from '../betting/betting.ts';
import { useSecondsLeft } from '../betting/useSecondsLeft.ts';
import { TopBar } from '../app/TopBar.tsx';
import { formatForm } from '../history/badges.ts';
import { canOpenShop, joinUrl, normalizeCode, OFFICE_CODE } from '../lobby/lobby.ts';
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
  setTrack,
  startRace,
  type RoomPlayer,
  type RoomState,
} from '../net/rooms.ts';
import { useCheers } from '../net/cheers.ts';
import { useOfficeStats } from '../net/stats.ts';
import { useRoom } from '../net/useRoom.ts';
import { useTimeline } from '../net/useTimeline.ts';
import { colorsByPlayer } from '../render/palette.ts';
import { RaceView, Silk } from '../render/RaceView.tsx';
import { TRACKS, trackById } from '../render/track.ts';
import { MAX_HORSES, PRICES } from '../sim/config.ts';
import { gunMs } from '../sim/playback.ts';
import type { RaceLength } from '../sim/types.ts';
import { soundEngine, useAudioSettings } from '../audio/sound.ts';
import { SoundToggle } from '../audio/SoundToggle.tsx';
import { podiumLine } from '../audio/commentator.ts';
import { useRaceAudio } from '../audio/useRaceAudio.ts';
import { JoinQr } from './JoinQr.tsx';
import { OfficeHostLogin } from './OfficeHostLogin.tsx';
import { useChances } from './useChances.ts';
import { GROUP_KINDS, groupLanes } from '../sim/odds.ts';

type Act = (fn: () => Promise<unknown>) => void;
type BoardProps = RoomState & { online: ReadonlySet<string>; act: Act; busy: boolean };

/** Podium banter waits this long after the results show, so it doesn't talk over the winner line. */
const PODIUM_BANTER_MS = 3000;
const LENGTH_LABEL: Record<RaceLength, string> = { short: 'Short (~2 min)', long: 'Long (~3 min)' };

/** Big screen for the host device. */
export function TrackPage() {
  const code = normalizeCode(new URLSearchParams(window.location.search).get('code') ?? '') ?? '';
  const { state, online, error, refresh } = useRoom(code);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { settings, update } = useAudioSettings('screen');
  const phase = state?.room.phase;
  // Keyed on the theme, not the phase: Lobby -> Shop -> Betting keeps the same song playing.
  const music =
    phase === undefined || phase === 'PODIUM' ? null : phase === 'RUNNING' ? 'race' : 'lobby';
  useEffect(() => {
    soundEngine().setMusic(music);
    return () => soundEngine().setMusic(null);
  }, [music]);

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
      <TopBar code={state.room.code}>
        <SoundToggle settings={settings} update={update} full />
      </TopBar>
      {state.race && <p>Track: {trackById(state.race.track).name}</p>}
      {Board ? (
        <Board {...state} online={online} act={act} busy={busy} />
      ) : (
        <p>Phase: {state.room.phase}</p>
      )}
      {actionError && <p role="alert">{actionError}</p>}
    </main>
  );
}

function LobbyBoard({ room, players, balances, online, act, busy }: BoardProps) {
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
      <h1 className="visually-hidden">Lobby · room {room.code}</h1>
      <section className="panel join">
        <p className="code glow">{room.code}</p>
        <JoinQr url={joinUrl(window.location.origin, room.code)} />
        <p>Scan, or open {window.location.host}/play and enter the code.</p>
      </section>
      <section>
        <div className="panel settings">
          <fieldset>
            <legend>Race length</legend>
            {(['short', 'long'] as const).map((l) => (
              <label key={l} htmlFor={`length-${l}`}>
                <input
                  id={`length-${l}`}
                  type="radio"
                  name="length"
                  value={l}
                  checked={length === l}
                  onChange={() => act(() => setRaceLength(room.id, l))}
                />{' '}
                {LENGTH_LABEL[l]}{' '}
              </label>
            ))}
          </fieldset>
          <fieldset>
            <legend>Track</legend>
            {(['oval', 'speedway', 'kidney', 'random'] as const).map((id) => (
              <label key={id} htmlFor={`track-${id}`}>
                <input
                  id={`track-${id}`}
                  type="radio"
                  name="track"
                  value={id}
                  checked={room.track === id}
                  onChange={() => act(() => setTrack(room.id, id))}
                />{' '}
                {id === 'random' ? 'Random' : TRACKS[id].name}{' '}
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
        </div>

        {office && players.length > 0 && (
          <p>
            💰 Richest:{' '}
            {[...players]
              .sort((a, b) => (balances[b.id] ?? 0) - (balances[a.id] ?? 0))
              .slice(0, 3)
              .map((p) => `${p.name} ${balances[p.id] ?? 0}`)
              .join(' · ')}
          </p>
        )}
        <h2>
          Roster ({ticked}/{MAX_HORSES} racing)
        </h2>
        {/* Above the roster, so new names don't push it down. */}
        {!office && (
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
        <ul className="roster">
          {players.map((p) => (
            <li key={p.id} className="card">
              <label htmlFor={`tick-${p.id}`}>
                <input
                  id={`tick-${p.id}`}
                  type="checkbox"
                  checked={p.ticked}
                  onChange={(e) => act(() => setTicked(p.id, e.target.checked))}
                />{' '}
                {p.name}
              </label>
              {office && <span className="chip">💰 {balances[p.id] ?? 0}</span>}
              {p.uid && (
                <span className={online.has(p.id) ? 'chip on' : 'chip'}>
                  {online.has(p.id) ? '📱 online' : '📴 offline'}
                </span>
              )}
              {!office && (
                <button
                  type="button"
                  className="remove"
                  aria-label={`Remove ${p.name}`}
                  onClick={() => act(() => removePlayer(p.id))}
                >
                  ✕
                </button>
              )}
            </li>
          ))}
        </ul>
        {office && (
          <p>
            People, PINs and coins are managed at <a href="/admin">/admin</a>. History:{' '}
            <a href="/stats">Stats</a>.
          </p>
        )}
        <p className="open-shop">
          <button
            type="button"
            className="primary"
            disabled={busy || !canOpenShop(players)}
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

/** A resting horse, or a galloping one once that phone has pressed Ready. */
function HorseMark({ ready }: { ready: boolean }) {
  return ready ? (
    <>
      <span className="face-right gallop" aria-hidden="true">
        🏇
      </span>
      <span className="visually-hidden">(ready)</span>
    </>
  ) : (
    <span className="face-right" aria-hidden="true">
      🐎
    </span>
  );
}

const percent = (p: number | undefined) => (p === undefined ? '…' : `${Math.round(p * 100)}%`);

function ShopBoard({ room, players, purchases, online, act, busy }: BoardProps) {
  const racing = players.filter((p) => p.ticked);
  const ids = racing.map((p) => p.id);
  const chances = useChances({
    horses: ids,
    bought: Object.fromEntries(ids.map((id) => [id, boxesOf(purchases, id)])),
    length: room.race_length as RaceLength,
  });
  const office = room.kind === 'office';
  const { stats } = useOfficeStats(room.race_id, office);
  return (
    <section>
      <h1>Shop open · room {room.code}</h1>
      <p>
        Phones: up to 3 boxes for your own lane —{' '}
        {BOX_TYPES.map((b) => `${BOX_ICON[b]} ${BOX_NAME[b]} ${PRICES[b]}`).join(' · ')}
      </p>
      <ReadyLine players={players} />
      <div className="panel">
        <table className="odds board">
          <thead>
            <tr>
              <th>Horse</th>
              <th>Boxes</th>
              <th>Win chance</th>
              {canPlace(ids) && <th>Top 3 chance</th>}
              {office && <th>Form</th>}
            </tr>
          </thead>
          <tbody>
            {racing.map((p) => (
              <tr key={p.id}>
                <td>
                  <HorseMark ready={p.ready} /> {horseName(p)}
                  {p.uid && !online.has(p.id) && ' (offline)'}
                </td>
                <td>{boxIcons(purchases, p.id)}</td>
                <td className="pixel">{percent(chances?.win[p.id])}</td>
                {canPlace(ids) && <td className="pixel">{percent(chances?.top3[p.id])}</td>}
                {office && (
                  <td>{formatForm(stats?.horses.find((h) => h.id === p.id)?.last5 ?? [])}</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        <small>
          Chances from {chances?.sims ?? '…'} simulated races with these boxes. Luck still counts: a
          horse with no boxes often makes the top 3.
        </small>
      </p>
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
      </button>{' '}
      <CancelRace room={room} act={act} busy={busy} />
    </section>
  );
}

function BettingBoard({ room, players, race, purchases, bets, act, busy }: BoardProps) {
  const odds = oddsOf(race);
  const groupOdds = groupOddsOf(race);
  const horses = race?.horses ?? [];
  const office = room.kind === 'office';
  const { stats } = useOfficeStats(room.race_id, office);
  const colors = colorsByPlayer(players);
  return (
    <section>
      <h1>Place your bets · room {room.code}</h1>
      <div className="panel">
        <table className="odds board">
          <thead>
            <tr>
              <th>#</th>
              <th>Horse</th>
              {office && <th>Form</th>}
              <th>Boxes</th>
              <th>Win</th>
              {canPlace(horses) && <th>Place</th>}
            </tr>
          </thead>
          <tbody>
            {horses.map((id, lane) => (
              <tr key={id}>
                <td className="pixel">#{lane + 1}</td>
                <td>
                  <HorseMark ready={players.find((p) => p.id === id)?.ready ?? false} />{' '}
                  <Silk color={colors(id, lane).silk} /> {horseNameOf(players, id)}
                </td>
                {office && (
                  <td>{formatForm(stats?.horses.find((h) => h.id === id)?.last5 ?? [])}</td>
                )}
                <td>{boxIcons(purchases, id)}</td>
                <td className="pixel">{formatOdds(odds[id]?.win)}</td>
                {canPlace(horses) && <td className="pixel">{formatOdds(odds[id]?.place)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {GROUP_KINDS.some((g) => groupOdds[g] !== undefined) && (
        <p className="pixel">
          Winner's number:{' '}
          {GROUP_KINDS.map(
            (g) =>
              `${GROUP_NAME[g]} (${groupLanes(g, horses.length)
                .map((l) => `#${l}`)
                .join(' ')}) ${formatOdds(groupOdds[g])}`,
          ).join(' · ')}
        </p>
      )}
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
      </button>{' '}
      <button type="button" disabled={busy} onClick={() => act(() => setPhase(room.id, 'SHOP'))}>
        Back to shop (refunds bets)
      </button>{' '}
      <CancelRace room={room} act={act} busy={busy} />
    </section>
  );
}

/** Way out of a stuck "Calculating odds…" or an unwanted race; deleting the race refunds everything. */
function CancelRace({ room, act, busy }: Pick<BoardProps, 'room' | 'act' | 'busy'>) {
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() =>
        window.confirm('Cancel this race? All boxes and bets are refunded.') &&
        act(() => setPhase(room.id, 'LOBBY'))
      }
    >
      Cancel race (refund everything)
    </button>
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
  const ids = useMemo(() => new Set(players.map((p) => p.id)), [players]);
  const lastCheerSfx = useRef(0);
  const shown = useCheers(room.id, ids, () => {
    const n = Date.now();
    if (n - lastCheerSfx.current >= 300) {
      lastCheerSfx.current = n;
      soundEngine().sfx('cheer');
    }
  });
  const shownRef = useRef(shown);
  useEffect(() => {
    shownRef.current = shown;
  });
  useRaceAudio(timeline, race?.started_at ? gunMs(race.started_at) : 0, {
    names,
    commentary: true,
    odds: oddsOf(race),
    prize: race?.prize ?? '',
    cheers: () => shownRef.current.length,
  });
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
      <h1 className="visually-hidden">Race · room {room.code}</h1>
      {timeline && race?.started_at ? (
        <RaceView
          timeline={timeline}
          startAtMs={gunMs(race.started_at)}
          names={names}
          colors={colors}
          track={trackById(race.track)}
        >
          <ul className="cheers" aria-hidden="true">
            {shown.map((c) => (
              <li key={c.id} className="chip">
                {c.emoji} {nameOf(players, c.player)}
              </li>
            ))}
          </ul>
        </RaceView>
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
  const raceId = race?.id;
  const banter = useRef('');
  useEffect(() => {
    banter.current = podiumLine(
      winners.map((b) => ({ name: nameOf(players, b.player_id), payout: b.payout ?? 0 })),
      bets.length,
    );
  });
  useEffect(() => {
    if (!raceId) return;
    const timer = setTimeout(() => soundEngine().say(banter.current), PODIUM_BANTER_MS);
    return () => clearTimeout(timer);
  }, [raceId]);
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
      <section className="panel">
        <h2>Payouts</h2>
        {best && (
          <p>
            🎉 Biggest win: {nameOf(players, best.player_id)} won {best.payout} on{' '}
            {betOn(best, players)}
          </p>
        )}
        {winners.length === 0 ? (
          <p>No winning bets.</p>
        ) : (
          <ul>
            {winners.map((b) => (
              <li key={b.id}>
                {nameOf(players, b.player_id)} won {b.payout} on {betOn(b, players)}
              </li>
            ))}
          </ul>
        )}
      </section>
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
