import { useState, type FormEvent } from 'react';
import { canOpenShop, joinUrl } from '../lobby/lobby.ts';
import {
  addPlayer,
  errorText,
  removePlayer,
  setPhase,
  setTicked,
  setPrize as savePrizeRpc,
  setRaceLength,
  type Room,
  type RoomPlayer,
} from '../net/rooms.ts';
import { useRoom } from '../net/useRoom.ts';
import { MAX_HORSES } from '../sim/config.ts';
import type { RaceLength } from '../sim/types.ts';
import { JoinQr } from './JoinQr.tsx';

type Act = (fn: () => Promise<unknown>) => void;
type BoardProps = { room: Room; players: RoomPlayer[]; online: ReadonlySet<string>; act: Act };

const LENGTH_LABEL: Record<RaceLength, string> = { short: 'Short (~2 min)', long: 'Long (~3 min)' };

/** Big screen for the host device. */
export function TrackPage() {
  const code = new URLSearchParams(window.location.search).get('code') ?? '';
  const { state, online, error, refresh } = useRoom(code);
  const [actionError, setActionError] = useState<string | null>(null);

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
    fn().then(refresh, (e: unknown) => setActionError(errorText(e)));
  };
  const props: BoardProps = { ...state, online, act };

  return (
    <main className="track">
      {state.room.phase === 'LOBBY' && <LobbyBoard {...props} />}
      {state.room.phase === 'SHOP' && <ShopBoard {...props} />}
      {state.room.phase !== 'LOBBY' && state.room.phase !== 'SHOP' && (
        <p>Phase: {state.room.phase}</p>
      )}
      {actionError && <p role="alert">{actionError}</p>}
    </main>
  );
}

function LobbyBoard({ room, players, online, act }: BoardProps) {
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
              {p.uid && <span>{online.has(p.id) ? '📱 online' : '📴 offline'}</span>}
              <button
                type="button"
                aria-label={`Remove ${p.name}`}
                onClick={() => act(() => removePlayer(p.id))}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
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

function ShopBoard({ room, players, online, act }: BoardProps) {
  const phones = players.filter((p) => p.uid);
  return (
    <section>
      <h1>Shop open · room {room.code}</h1>
      <p>Buying boxes arrives in the next update.</p>
      <p>
        Ready: {phones.filter((p) => p.ready).length}/{phones.length}
      </p>
      <ul className="roster">
        {players.map((p) => (
          <li key={p.id}>
            {p.uid ? (p.ready ? '✅' : '⏳') : '—'} {p.name}
            {p.ticked && ' 🐎'}
            {p.uid && !online.has(p.id) && ' (offline)'}
          </li>
        ))}
      </ul>
      <button type="button" onClick={() => act(() => setPhase(room.id, 'LOBBY'))}>
        Back to lobby
      </button>
    </section>
  );
}
