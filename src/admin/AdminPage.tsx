import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { adminAction, errorText } from '../net/rooms.ts';
import { TopBar } from '../app/TopBar.tsx';

type Member = {
  id: string;
  name: string;
  horse_name: string | null;
  balance: number;
  has_pin: boolean;
  phone: boolean;
  archived: boolean;
};
type RaceRow = {
  id: string;
  created_at: string;
  length: string;
  prize: string;
  horses: number;
  finished: boolean;
  current: boolean;
};
type Overview = {
  room: { phase: string; weather_enabled: boolean; hot_items_enabled: boolean };
  members: Member[];
  races: RaceRow[];
};

const KEY = 'hrtc-admin';
const loadPassword = () => {
  try {
    return sessionStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
};
/** These mean the stored password is useless right now: drop it and show the form again. */
const isAuthError = (e: unknown) =>
  e instanceof Error && (e.message === 'bad_password' || e.message === 'admin_locked');

const storePassword = (v: string) => {
  try {
    if (v) sessionStorage.setItem(KEY, v);
    else sessionStorage.removeItem(KEY);
  } catch {
    // Storage blocked (private mode): the password is just asked again next time.
  }
};

/** /admin (spec §10): people, PINs, coins and races. The password stays in this tab only. */
export function AdminPage() {
  const [password, setPassword] = useState(loadPassword);
  const [typed, setTyped] = useState('');
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPin, setNewPin] = useState('');

  const lock = () => {
    storePassword('');
    setPassword('');
    setData(null);
  };
  const refresh = useCallback(
    (pw: string) =>
      adminAction<Overview>(pw, 'overview').then(setData, (e: unknown) => {
        setError(errorText(e));
        if (isAuthError(e)) {
          storePassword('');
          setPassword('');
        }
      }),
    [],
  );

  useEffect(() => {
    if (password) void refresh(password);
  }, [password, refresh]);

  const run = (action: string, args: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    adminAction(password, action, args)
      .then(
        () => refresh(password),
        (e: unknown) => {
          setError(errorText(e));
          if (isAuthError(e)) lock();
        },
      )
      .finally(() => setBusy(false));
  };

  if (!password) {
    const open = (e: FormEvent) => {
      e.preventDefault();
      storePassword(typed);
      setPassword(typed);
    };
    return (
      <main>
        <TopBar />
        <h1>Admin</h1>
        <form onSubmit={open}>
          <label>
            Admin password{' '}
            <input
              type="password"
              value={typed}
              autoComplete="current-password"
              onChange={(e) => setTyped(e.target.value)}
            />
          </label>{' '}
          <button type="submit" disabled={!typed}>
            Open
          </button>
        </form>
        {error && <p role="alert">{error}</p>}
      </main>
    );
  }

  const add = (e: FormEvent) => {
    e.preventDefault();
    run('add', { name: newName, pin: newPin });
    setNewName('');
    setNewPin('');
  };
  const setPin = (m: Member) => {
    const pin = window.prompt(
      `New 4-digit PIN for ${m.name}${m.phone ? ' (signs their phone out)' : ''}`,
    );
    if (pin) run('reset_pin', { player: m.id, pin });
  };
  const rename = (m: Member) => {
    const name = window.prompt(`New name for ${m.name}`, m.name);
    if (name && name !== m.name) run('rename', { player: m.id, name });
  };
  const adjust = (m: Member) => {
    const amount = Number(window.prompt(`Coins to add to ${m.name} (negative to take away)`, '0'));
    if (!Number.isInteger(amount) || amount === 0) return;
    const reason = window.prompt('Reason (required)');
    if (reason) run('adjust', { player: m.id, amount, reason });
  };

  return (
    <main>
      <TopBar />
      <h1>Admin</h1>
      <p>
        Office phase: {data?.room.phase ?? '…'}{' '}
        <button type="button" onClick={lock}>
          Lock
        </button>
      </p>
      <p>
        <label>
          <input
            type="checkbox"
            checked={data?.room.weather_enabled ?? true}
            disabled={busy || !data}
            onChange={(e) => run('weather', { on: e.target.checked })}
          />{' '}
          Weather (rain and fog races)
        </label>
      </p>
      <p>
        <label>
          <input
            type="checkbox"
            checked={data?.room.hot_items_enabled ?? true}
            disabled={busy || !data}
            onChange={(e) => run('hot_items', { on: e.target.checked })}
          />{' '}
          Hot items (3 buffed powerups per race)
        </label>
      </p>
      <h2>People</h2>
      <form onSubmit={add}>
        <input
          aria-label="New member name"
          placeholder="Name"
          maxLength={24}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />{' '}
        <input
          aria-label="Their 4-digit PIN"
          placeholder="PIN"
          inputMode="numeric"
          autoComplete="off"
          maxLength={4}
          value={newPin}
          onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
        />{' '}
        <button type="submit" disabled={busy || !newName.trim() || newPin.length !== 4}>
          Add person
        </button>
      </form>
      <div className="scroll-x">
        <table className="odds">
          <thead>
            <tr>
              <th>Name</th>
              <th>Coins</th>
              <th>PIN</th>
              <th>Phone</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {/* Removed members keep their history in the DB but leave the list. */}
            {data?.members
              .filter((m) => !m.archived)
              .map((m) => (
                <tr key={m.id}>
                  <td>
                    {m.name}
                    {m.horse_name && ` (🐎 ${m.horse_name})`}
                  </td>
                  <td>{m.balance}</td>
                  <td>{m.has_pin ? 'set' : '—'}</td>
                  <td>{m.phone ? '📱' : ''}</td>
                  <td>
                    <button type="button" disabled={busy} onClick={() => rename(m)}>
                      Rename
                    </button>{' '}
                    <button type="button" disabled={busy} onClick={() => adjust(m)}>
                      Coins
                    </button>{' '}
                    <button type="button" disabled={busy} onClick={() => setPin(m)}>
                      {m.has_pin ? 'Reset PIN' : 'Set PIN'}
                    </button>{' '}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        window.confirm(`Remove ${m.name}? Their history stays.`) &&
                        run('archive', { player: m.id })
                      }
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      <h2>Recent races</h2>
      <ul>
        {data?.races.map((r) => (
          <li key={r.id}>
            {new Date(r.created_at).toLocaleString()} · {r.length} · {r.horses} horses
            {r.prize && ` · ${r.prize}`} ·{' '}
            {r.current ? 'in progress' : r.finished ? 'finished' : 'not run'}{' '}
            {!r.current && (
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  window.confirm('Delete this race? Its bets, payouts and coins are reversed.') &&
                  run('delete_race', { race: r.id })
                }
              >
                Delete
              </button>
            )}
          </li>
        ))}
      </ul>
      {error && <p role="alert">{error}</p>}
    </main>
  );
}
