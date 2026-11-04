import { useState, type FormEvent } from 'react';
import { normalizeCode, OFFICE_CODE } from '../lobby/lobby.ts';
import { createRoom, errorText } from '../net/rooms.ts';
import { ensureSignedIn } from '../net/supabase.ts';
import { TopBar } from './TopBar.tsx';

export function Home() {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const host = async () => {
    setBusy(true);
    setError(null);
    try {
      await ensureSignedIn();
      const room = await createRoom('short', '');
      if (!room) throw new Error('no room');
      window.location.assign(`/track?code=${room.code}`);
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  };

  const join = (e: FormEvent) => {
    e.preventDefault();
    const c = normalizeCode(code);
    if (c) window.location.assign(`/play?code=${c}`);
    else setError('Room codes are 4 letters or digits.');
  };

  return (
    <main className="home">
      <TopBar />
      <h1>Horse Racing Turf Club</h1>
      <div className="home-cards">
        <section className="panel">
          <h2>Private race</h2>
          <p>
            <button type="button" className="primary" onClick={host} disabled={busy}>
              Host a race (big screen)
            </button>
          </p>
          <form onSubmit={join}>
            <label>
              Room code{' '}
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                maxLength={4}
                autoCapitalize="characters"
                autoComplete="off"
              />
            </label>{' '}
            <button type="submit">Join</button>
          </form>
        </section>
        <section className="panel">
          <h2>Office</h2>
          <p>
            <a className="button primary" href={`/track?code=${OFFICE_CODE}`}>
              Office big screen
            </a>
          </p>
          <p>
            <a className="button" href={`/play?code=${OFFICE_CODE}`}>
              Join the office race (phone)
            </a>
          </p>
          <p>
            <a href="/stats">Stats</a> · <a href="/admin">Admin</a>
          </p>
        </section>
      </div>
      {error && <p role="alert">{error}</p>}
    </main>
  );
}
