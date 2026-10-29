import { useEffect, useState, type FormEvent } from 'react';
import { normalizeCode } from '../lobby/lobby.ts';
import { errorText, joinRoom, setReady, type RoomPlayer } from '../net/rooms.ts';
import { ensureSignedIn } from '../net/supabase.ts';
import { useRoom } from '../net/useRoom.ts';

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

  const toggleReady = () => {
    setActionError(null);
    setReady(room.id, !mine.ready).then(refresh, (e: unknown) => setActionError(errorText(e)));
  };

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
      {room.phase === 'SHOP' && (
        <>
          <p>The shop is open. Buying boxes arrives in the next update.</p>
          <button type="button" className="primary" onClick={toggleReady}>
            {mine.ready ? 'Ready ✅ (tap to undo)' : "I'm ready"}
          </button>
        </>
      )}
      {room.phase !== 'LOBBY' && room.phase !== 'SHOP' && <p>Phase: {room.phase}</p>}
      {actionError && <p role="alert">{actionError}</p>}
    </main>
  );
}
