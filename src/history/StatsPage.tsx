import { useEffect, useMemo, useState } from 'react';
import { horseName } from '../betting/betting.ts';
import { OFFICE_CODE } from '../lobby/lobby.ts';
import { useOfficeStats, type OfficeStats, type Ranked } from '../net/stats.ts';
import { ensureSignedIn } from '../net/supabase.ts';
import { useTimeline } from '../net/useTimeline.ts';
import { colorsByPlayer } from '../render/palette.ts';
import { RaceView } from '../render/RaceView.tsx';
import { COUNTDOWN_SECONDS } from '../sim/playback.ts';
import { BADGES, formatForm } from './badges.ts';

/** /stats (spec §9): leaderboards, horse records, badges and replays for the office. */
export function StatsPage() {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    void ensureSignedIn().finally(() => setSignedIn(true));
  }, []);
  const { stats, error, loaded } = useOfficeStats(signedIn, signedIn);
  const [replay, setReplay] = useState<{ race: string; gun: number } | null>(null);

  if (!loaded) return <main>Loading…</main>;
  if (error) {
    return (
      <main>
        <p role="alert">{error}</p>
      </main>
    );
  }
  if (!stats) {
    return (
      <main>
        <h1>Office stats</h1>
        <p>
          Sign in first: on a phone via{' '}
          <a href={`/play?code=${OFFICE_CODE}`}>Join the office race</a>, or unlock the{' '}
          <a href={`/track?code=${OFFICE_CODE}`}>office big screen</a>.
        </p>
      </main>
    );
  }
  return (
    <main className="stats">
      <h1>Office stats</h1>
      {replay ? (
        <Replay stats={stats} race={replay.race} gun={replay.gun} onClose={() => setReplay(null)} />
      ) : (
        <Overview
          stats={stats}
          onReplay={(race) => setReplay({ race, gun: Date.now() + COUNTDOWN_SECONDS * 1000 })}
        />
      )}
    </main>
  );
}

function Overview({ stats, onReplay }: { stats: OfficeStats; onReplay: (race: string) => void }) {
  const byId = new Map(stats.members.map((m) => [m.id, m]));
  const who = (id: string) => byId.get(id)?.name ?? '?';
  const horse = (id: string) => {
    const m = byId.get(id);
    return m ? horseName(m) : '?';
  };
  const board = (title: string, rows: Ranked[]) => (
    <section>
      <h2>{title}</h2>
      {rows.length === 0 ? (
        <p>Nobody yet.</p>
      ) : (
        <ol>
          {rows.map((r, i) => (
            <li key={`${r.id}-${i}`}>
              {who(r.id)} · {r.value} coins
            </li>
          ))}
        </ol>
      )}
    </section>
  );
  return (
    <>
      <div className="boards">
        {board('💰 Richest', stats.richest)}
        {board('🎉 Biggest single win', stats.biggest_payout)}
        {board('😬 Biggest loss in one race', stats.biggest_loss)}
        {board('📈 Best betting profit', stats.best_profit)}
      </div>

      <h2>Horses</h2>
      {stats.horses.length === 0 ? (
        <p>No races yet.</p>
      ) : (
        <div className="scroll-x">
          <table className="odds">
            <thead>
              <tr>
                <th>Horse</th>
                <th>Races</th>
                <th>Wins</th>
                <th>Places</th>
                <th>Win %</th>
                <th>Form</th>
              </tr>
            </thead>
            <tbody>
              {stats.horses.map((h) => (
                <tr key={h.id}>
                  <td>{horse(h.id)}</td>
                  <td>{h.races}</td>
                  <td>{h.wins}</td>
                  <td>{h.places}</td>
                  <td>{Math.round((100 * h.wins) / h.races)}%</td>
                  <td>{formatForm(h.last5)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2>Badges</h2>
      {stats.badges.length === 0 ? (
        <p>None earned yet.</p>
      ) : (
        <ul className="badges">
          {stats.badges.map((b) => (
            <li key={`${b.id}-${b.badge}`} title={BADGES[b.badge].description}>
              {BADGES[b.badge].icon} {BADGES[b.badge].name} · {who(b.id)}
            </li>
          ))}
        </ul>
      )}

      <h2>Recent races</h2>
      {stats.recent.length === 0 ? (
        <p>No races yet.</p>
      ) : (
        <ul>
          {stats.recent.map((r) => (
            <li key={r.race}>
              {new Date(r.at).toLocaleString()} · {r.podium.map(horse).join(', ')}
              {r.prize && ` · ${r.prize}`}{' '}
              {r.replay && (
                <button type="button" onClick={() => onReplay(r.race)}>
                  Replay
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function Replay(props: { stats: OfficeStats; race: string; gun: number; onClose: () => void }) {
  const { stats, race, gun, onClose } = props;
  const { timeline, error } = useTimeline(race);
  const names = useMemo(
    () => Object.fromEntries(stats.members.map((m) => [m.id, horseName(m)])),
    [stats.members],
  );
  const colors = useMemo(() => colorsByPlayer(stats.members), [stats.members]);
  return (
    <section>
      <button type="button" onClick={onClose}>
        ← Back to stats
      </button>
      {timeline ? (
        <RaceView timeline={timeline} startAtMs={gun} names={names} colors={colors} />
      ) : (
        <p>{error ?? 'Loading the replay…'}</p>
      )}
    </section>
  );
}
