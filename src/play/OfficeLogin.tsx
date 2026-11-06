import { useEffect, useState, type FormEvent } from 'react';
import { errorText, officeLogin, officeRoster, type RoomPlayer } from '../net/rooms.ts';

type Entry = { id: string; name: string; has_pin: boolean };

/** Office phones: pick your name, enter the 4-digit PIN the admin gave you. */
export function OfficeLogin({ onLogin }: { onLogin: (player: RoomPlayer) => void }) {
  const [roster, setRoster] = useState<Entry[] | null>(null);
  const [pick, setPick] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    officeRoster().then(
      (rows) => setRoster(rows ?? []),
      (e: unknown) => setError(errorText(e)),
    );
  }, []);

  const chosen = roster?.find((r) => r.id === pick);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    officeLogin(pick, pin).then(onLogin, (err: unknown) => {
      setError(errorText(err));
      setPin('');
      setBusy(false);
    });
  };

  if (!roster)
    return <main className="play">{error ? <p role="alert">{error}</p> : 'Loading…'}</main>;
  return (
    <main className="play center">
      <section className="panel">
        <h1>Office race</h1>
        {roster.length === 0 ? (
          <p>No members yet. Ask the admin to add you at /admin.</p>
        ) : (
          <form className="shop" onSubmit={submit}>
            <label>
              Who are you?{' '}
              <select
                value={pick}
                onChange={(e) => {
                  setPick(e.target.value);
                  setPin('');
                }}
              >
                <option value="">Pick your name</option>
                {roster.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>
            {chosen && !chosen.has_pin && <p>{errorText('no_pin')}</p>}
            {chosen?.has_pin && (
              <>
                <label>
                  Your PIN{' '}
                  <input
                    type="password"
                    inputMode="numeric"
                    autoComplete="off"
                    pattern="[0-9]{4}"
                    maxLength={4}
                    value={pin}
                    aria-describedby="pin-tip"
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                  />
                </label>
                <p id="pin-tip">
                  <small>💡 Tip: your default PIN is 00 followed by your ID.</small>
                </p>
                <button type="submit" className="primary" disabled={busy || pin.length !== 4}>
                  Sign in
                </button>
              </>
            )}
          </form>
        )}
        {error && <p role="alert">{error}</p>}
      </section>
    </main>
  );
}
