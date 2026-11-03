import { useState, type FormEvent } from 'react';
import { adminAction, errorText } from '../net/rooms.ts';
import { ensureSignedIn } from '../net/supabase.ts';

/** The office big screen is unlocked with the admin password; this device becomes the host. */
export function OfficeHostLogin() {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    ensureSignedIn()
      .then(() => adminAction(password, 'claim_host'))
      .then(
        () => window.location.reload(),
        (err: unknown) => {
          setError(errorText(err));
          setBusy(false);
        },
      );
  };
  return (
    <main className="track">
      <h1>Office race · big screen</h1>
      <form onSubmit={submit}>
        <label>
          Admin password{' '}
          <input
            type="password"
            value={password}
            autoComplete="current-password"
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>{' '}
        <button type="submit" className="primary" disabled={busy || !password}>
          Unlock
        </button>
      </form>
      <p>Opening the big screen here takes it over from any other screen.</p>
      {error && <p role="alert">{error}</p>}
    </main>
  );
}
