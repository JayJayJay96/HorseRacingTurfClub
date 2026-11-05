import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  BOX_ICON,
  BOX_NAME,
  BOX_TYPES,
  boxesOf,
  betOn,
  betWinning,
  canPlace,
  formatOdds,
  GROUP_NAME,
  groupOddsOf,
  horseNameOf,
  isGroup,
  oddsOf,
  ordinal,
} from '../betting/betting.ts';
import { GROUP_KINDS, groupLanes } from '../sim/odds.ts';
import { phoneAnnouncement } from '../app/announce.ts';
import { ActionBar, BET_FORM } from './ActionBar.tsx';
import { PhaseBanner } from '../app/PhaseBanner.tsx';
import { TopBar } from '../app/TopBar.tsx';
import { WeatherBadge } from '../app/WeatherBadge.tsx';
import { HotStrip, hotBoxTypes, hotOf } from '../app/HotItems.tsx';
import { TRAIT_INFO, asTrait, traitOf } from '../app/Traits.tsx';
import { TraitPicker } from './TraitPicker.tsx';
import { GuideButton } from './Guide.tsx';
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
  setTrait,
  type BetKind,
  type RoomPlayer,
  type RoomState,
} from '../net/rooms.ts';
import { CHEER_GAP_MS, CHEERS, sendCheer, useCheers, type CheerEmoji } from '../net/cheers.ts';
import { useOfficeStats, type OfficeStats } from '../net/stats.ts';
import { ensureSignedIn } from '../net/supabase.ts';
import { useRoom } from '../net/useRoom.ts';
import { useTimeline } from '../net/useTimeline.ts';
import { BOX_COLOR, colorsByPlayer, horseColors } from '../render/palette.ts';
import { HorseSprite } from '../render/HorseSprite.tsx';
import { trackById } from '../render/track.ts';
import { useRaceTime } from '../render/useRaceTime.ts';
import { MAX_BOUGHT, PRICES } from '../sim/config.ts';
import { gunMs, standingsAt } from '../sim/playback.ts';
import { HorsePanel } from './HorsePanel.tsx';
import { MiniOval } from './MiniOval.tsx';
import { OfficeLogin } from './OfficeLogin.tsx';
import { ResultCard } from './ResultCard.tsx';

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
    <main className="play center">
      <section className="panel">
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
      </section>
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
      <PhaseBanner phase={room.phase} />
      <TopBar
        coins={props.balance}
        title={
          <>
            <HorseSprite
              colors={horseColors(state.players, state.race?.horses ?? [], mine.id)}
              size="md"
            />
            <h1>{mine.name}</h1>
          </>
        }
      >
        <GuideButton />
        <SoundToggle settings={settings} update={update} icon />
      </TopBar>
      <p className="room-line">
        Room {room.code} · {room.race_length === 'long' ? 'Long (~3 min)' : 'Short (~2 min)'}
        {room.prize && ` · Prize: ${room.prize}`}
      </p>
      {state.race && room.phase !== 'LOBBY' && (
        <p className="room-line">
          <span aria-hidden="true">🗺️</span> {trackById(state.race.track).name} ·{' '}
          {trackById(state.race.track).blurb}
        </p>
      )}
      <WeatherBadge weather={state.race?.weather} />
      {(room.phase === 'SHOP' || room.phase === 'BETTING') && (
        <HotStrip hot={state.race?.hot_items} />
      )}
      {room.phase === 'LOBBY' && (
        <section className="panel lobby-card">
          <HorseSprite
            colors={horseColors(state.players, state.race?.horses ?? [], mine.id)}
            size="lg"
          />
          <p className="lobby-name">{mine.name}</p>
          <p>
            {mine.ticked
              ? "You're racing today! Waiting for the host to open the shop."
              : 'Waiting for the host to tick you in.'}
          </p>
        </section>
      )}
      {room.kind === 'office' && room.phase === 'LOBBY' && (
        <>
          <p>💰 {props.balance} coins</p>
          <MyRecord stats={stats} id={mine.id} />
          <HorsePanel
            roomId={room.id}
            mine={mine}
            colors={horseColors(state.players, state.race?.horses ?? [], mine.id)}
            balance={props.balance}
            act={act}
            busy={busy}
          />
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

function ShopPanel({ room, race, mine, purchases, balance, act, busy }: PanelProps) {
  const bar = (
    <ActionBar
      ready={mine.ready}
      busy={busy}
      onReady={() => act(() => setReady(room.id, !mine.ready))}
    />
  );
  if (!mine.ticked) {
    return (
      <>
        <p>💰 {balance} coins. You're not racing, but you can bet once the odds lock.</p>
        {bar}
      </>
    );
  }
  const boxes = boxesOf(purchases, mine.id);
  const hotTypes = hotBoxTypes(hotOf(race?.hot_items));
  return (
    <>
      <p>
        Your boxes: {boxes.length ? boxes.map((b) => BOX_ICON[b]).join(' ') : 'none'}{' '}
        <span className="chip">
          {boxes.length}/{MAX_BOUGHT} boxes
        </span>
      </p>
      <div className="box-cards">
        {BOX_TYPES.map((box) => (
          <button
            key={box}
            type="button"
            className="card box-card"
            style={{ borderTopColor: BOX_COLOR[box] }}
            disabled={busy || boxes.length >= MAX_BOUGHT || balance < PRICES[box]}
            onClick={() => act(() => buyBox(room.id, box).then(playCoin))}
          >
            <span className="box-icon">{BOX_ICON[box]}</span>
            <span>
              {BOX_NAME[box]}
              {hotTypes.has(box) && (
                <>
                  {' '}
                  <span aria-hidden="true">🔥</span>
                  <span className="visually-hidden"> hot</span>
                </>
              )}
            </span>
            <span className="chip">{PRICES[box]} coins</span>
          </button>
        ))}
      </div>
      <TraitPicker
        current={asTrait(mine.trait)}
        disabled={busy}
        onPick={(trait) => act(() => setTrait(room.id, trait))}
      />
      <p>Boxes go in your own lane and open automatically. No refunds.</p>
      {bar}
    </>
  );
}

function BetPanel({ room, players, race, bets, mine, balance, act, busy }: PanelProps) {
  const odds = oddsOf(race);
  const horses = race?.horses ?? [];
  const myTrait = TRAIT_INFO[traitOf(race?.traits, mine.id)];
  const [pick, setPick] = useState('');
  // Until they pick, a player's own horse is preselected.
  const horse = horses.includes(pick)
    ? pick
    : horses.includes(mine.id)
      ? mine.id
      : (horses[0] ?? '');
  const groupOdds = groupOddsOf(race);
  // A group (Odd/Even/Low/High) replaces the horse when picked; it bets on the winner's number.
  const group = isGroup(pick) && typeof groupOdds[pick] === 'number' ? pick : null;
  const [choice, setChoice] = useState<BetKind>('win');
  const kind = group ?? (canPlace(horses) ? choice : 'win');
  // null = closed: the bet would pay less than it is worth even at the minimum odds.
  const line = odds[horse];
  const chosenOdds = group ? groupOdds[group] : kind === 'place' ? line?.place : line?.win;
  const [stake, setStake] = useState('10');
  const amount = Number(stake);
  const colors = colorsByPlayer(players);
  const myBets = bets.filter((b) => b.player_id === mine.id);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    act(() => placeBet(room.id, group ? null : horse, kind, amount).then(playCoin));
  };
  const betDisabled =
    busy ||
    !horse ||
    typeof chosenOdds !== 'number' ||
    !Number.isInteger(amount) ||
    amount < 1 ||
    amount > balance;

  return (
    <>
      {horses.includes(mine.id) && (
        <p>
          Trait: <span aria-hidden="true">{myTrait.icon}</span> {myTrait.name}
        </p>
      )}
      <form id={BET_FORM} className="shop" onSubmit={submit}>
        <fieldset className="horse-pick">
          <legend>Horse</legend>
          {horses.map((id, lane) => (
            <label key={id} className="card" htmlFor={`horse-${id}`}>
              <input
                id={`horse-${id}`}
                type="radio"
                name="horse"
                value={id}
                checked={!group && horse === id}
                onChange={() => setPick(id)}
              />
              <HorseSprite colors={colors(id, lane)} size="sm" />
              <span className="pixel">#{lane + 1}</span>
              <span>{horseNameOf(players, id)}</span>
              <span className="pixel odds-line">
                Win {formatOdds(odds[id]?.win)}
                {canPlace(horses) && ` · Place ${formatOdds(odds[id]?.place)}`}
              </span>
            </label>
          ))}
        </fieldset>
        {/* Win/Place belong to the horse bet, so they sit right under the horses. Picking one while
            a number bet is selected switches back to a horse bet (own horse first). */}
        <fieldset className="segmented">
          <legend>Bet on that horse</legend>
          <label htmlFor="kind-win">
            <input
              id="kind-win"
              type="radio"
              name="kind"
              value="win"
              checked={!group && kind === 'win'}
              disabled={!group && line?.win === null}
              onChange={() => {
                setChoice('win');
                if (group) setPick('');
              }}
            />
            Win (1st)
          </label>
          {canPlace(horses) && (
            <label htmlFor="kind-place">
              <input
                id="kind-place"
                type="radio"
                name="kind"
                value="place"
                checked={!group && kind === 'place'}
                disabled={!group && line?.place === null}
                onChange={() => {
                  setChoice('place');
                  if (group) setPick('');
                }}
              />
              Place (top 3)
            </label>
          )}
        </fieldset>
        {GROUP_KINDS.some((g) => groupOdds[g] !== undefined) && (
          <fieldset className="horse-pick">
            <legend>Or bet on the winner's number</legend>
            {GROUP_KINDS.map((g) => (
              <label key={g} className="card" htmlFor={`group-${g}`}>
                <input
                  id={`group-${g}`}
                  type="radio"
                  name="horse"
                  value={g}
                  checked={group === g}
                  disabled={typeof groupOdds[g] !== 'number'}
                  onChange={() => setPick(g)}
                />
                <span>{GROUP_NAME[g]}</span>
                <span className="pixel">
                  {groupLanes(g, horses.length)
                    .map((l) => `#${l}`)
                    .join(' ')}
                </span>
                <span className="pixel odds-line">{formatOdds(groupOdds[g])}</span>
              </label>
            ))}
          </fieldset>
        )}
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
        {chosenOdds === null && (
          <p role="status">
            That bet is closed: this pick is so likely that even the lowest odds would overpay.
          </p>
        )}
      </form>
      <h2>Your bets</h2>
      {myBets.length === 0 ? (
        <p>None yet. You can cancel bets until the race starts.</p>
      ) : (
        <ul>
          {myBets.map((b) => (
            <li key={b.id}>
              {b.stake} on {betOn(b, players)} @ {formatOdds(b.odds)}{' '}
              <button
                type="button"
                aria-label={`Cancel ${b.stake} bet on ${betOn(b, players)}`}
                disabled={busy}
                onClick={() => act(() => cancelBet(b.id))}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
      <ActionBar
        ready={mine.ready}
        busy={busy}
        onReady={() => act(() => setReady(room.id, !mine.ready))}
        bet={{ disabled: betDisabled }}
      />
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
  const lane = timeline.horses.indexOf(mine.id);
  return (
    <>
      <p className={t < 0 ? 'race-status glow' : 'race-status'}>
        {t < 0
          ? `🏁 Starting in ${Math.ceil(-t)}…`
          : t > last
            ? 'All home! Results in a moment…'
            : "🏇 And they're off!"}
      </p>
      {lane >= 0 && (
        <p className="you">
          {`#${lane + 1} ${mine.name}`}
          {t >= 0 && ` · ${ordinal(order.indexOf(mine.id) + 1)}`}
        </p>
      )}
      <div className="panel">
        <MiniOval
          timeline={timeline}
          t={t}
          mine={mine.id}
          colors={colorsByPlayer(players)}
          track={trackById(race.track)}
        />
      </div>
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
      {t >= 0 && myBets.length > 0 && (
        <ul>
          {myBets.map((b) => {
            const now = b.horse_id
              ? `${ordinal(order.indexOf(b.horse_id) + 1)} now`
              : `#${timeline.horses.indexOf(order[0] ?? '') + 1} leads`;
            return (
              <li key={b.id}>
                {betWinning(b, order, timeline.horses) ? '✅' : '⏳'} {b.stake} on{' '}
                {betOn(b, players)}: {now}
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
  const won = myBets.reduce((sum, b) => sum + (b.payout ?? 0), 0);
  return (
    <>
      <ResultCard
        colors={horseColors(players, race?.horses ?? [], mine.id)}
        place={place}
        won={won}
      />
      {myBets.length > 0 && (
        <ul className="my-bets">
          {myBets.map((b) => (
            <li key={b.id}>
              {b.stake} on {betOn(b, players)}{' '}
              <span className={b.payout ? 'chip win' : 'chip loss'}>
                {b.payout ? `won ${b.payout}` : 'lost'}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p>💰 Final balance: {balance} coins</p>
    </>
  );
}
