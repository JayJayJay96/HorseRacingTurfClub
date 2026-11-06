import { useRef, type ReactNode } from 'react';
import { BUFF_TEXT } from '../app/HotItems.tsx';
import { TRAIT_INFO } from '../app/Traits.tsx';
import { BOX_ICON, BOX_NAME, BOX_TYPES } from '../betting/betting.ts';
import { BADGES } from '../history/badges.ts';
import { ITEM_INFO } from '../render/items.ts';
import { TRACKS } from '../render/track.ts';
import { MAX_BOUGHT, PRICES, TRAIT_CODES } from '../sim/config.ts';
import type { ItemCode } from '../sim/types.ts';

/**
 * The phone's game guide (spec 2026-11-06 A). Lists come from the game's own tables, so new items,
 * traits, tracks and badges show up by themselves; update the prose when a feature changes.
 */
const ITEM_GROUPS: readonly [title: string, prefix: string][] = [
  ['⚡ Speed', 'speed:'],
  ['💥 Attack', 'attack:'],
  ['🛡️ Defense', 'defense:'],
  ['🍩 Bad luck (mystery boxes only)', 'dud:'],
];
const ITEMS = Object.keys(ITEM_INFO) as ItemCode[];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="guide-section">
      <summary>{title}</summary>
      {children}
    </details>
  );
}

export function GuideContent() {
  return (
    <>
      <Section title="🏁 Race day">
        <ol>
          <li>
            <b>Lobby:</b> the host ticks in who is racing.
          </li>
          <li>
            <b>Shop:</b> buy up to {MAX_BOUGHT} boxes and pick a trait. Tap Ready when done.
          </li>
          <li>
            <b>Odds lock:</b> the game runs the race thousands of times to price every horse.
          </li>
          <li>
            <b>Betting:</b> bet coins on any horse, yours included.
          </li>
          <li>
            <b>Race:</b> watch the big screen (the corner map shows the whole field) or the map on
            your phone; tap cheers to float them on the big screen.
          </li>
          <li>
            <b>Results:</b> winning bets pay out at the locked odds.
          </li>
        </ol>
      </Section>
      <Section title="📦 Boxes">
        <ul>
          {BOX_TYPES.map((b) => (
            <li key={b}>
              {BOX_ICON[b]} <b>{BOX_NAME[b]}</b> · {PRICES[b]} coins: one{' '}
              {BOX_NAME[b].toLowerCase()} power-up.
            </li>
          ))}
          <li>
            ❓ <b>Mystery</b> · free: every lane has some. Anything can be inside, even bad luck.
            Horses at the back get better mystery boxes.
          </li>
        </ul>
        <p>Boxes sit in your own lane and open by themselves when you run over them. No refunds.</p>
      </Section>
      <Section title="✨ Power-ups">
        {ITEM_GROUPS.map(([title, prefix]) => (
          <div key={prefix}>
            <h3>{title}</h3>
            <ul>
              {ITEMS.filter((i) => i.startsWith(prefix)).map((i) => (
                <li key={i}>
                  <span aria-hidden="true">{ITEM_INFO[i].icon}</span> <b>{ITEM_INFO[i].name}</b> ·{' '}
                  {ITEM_INFO[i].desc}
                </li>
              ))}
            </ul>
          </div>
        ))}
        <p>Weather slips and bumps aren't attacks: shields don't stop them.</p>
      </Section>
      <Section title="🐴 Traits">
        <p>Pick one each race in the shop. Every trait has an upside and a downside.</p>
        <ul>
          {TRAIT_CODES.map((t) => (
            <li key={t}>
              <span aria-hidden="true">{TRAIT_INFO[t].icon}</span> <b>{TRAIT_INFO[t].name}</b>
              <br />✅ {TRAIT_INFO[t].plus}
              <br />
              ⚠️ {TRAIT_INFO[t].minus}
            </li>
          ))}
        </ul>
      </Section>
      <Section title="🌦️ Weather">
        <ul>
          <li>
            ☀️ <b>Clear</b> · nothing special.
          </li>
          <li>
            🌧️ <b>Rain</b> · puddles on the track; horses may slip.
          </li>
          <li>
            🌫️ <b>Fog</b> · horses running side by side may bump.
          </li>
        </ul>
        <p>
          The weather is rolled when the shop closes, so a weather trait like Mudder is a gamble.
        </p>
      </Section>
      <Section title="🔥 Hot items">
        <p>
          Up to three power-ups are hot each race, shown at the top during the shop and betting:
        </p>
        <ul>
          <li>{BUFF_TEXT.lucky} · twice as likely to come out of its box.</li>
          <li>{BUFF_TEXT.extended} · lasts longer.</li>
        </ul>
      </Section>
      <Section title="🗺️ Tracks">
        <p>
          The host picks the track before each race; the phone shows it once the shop opens. Every
          horse runs the same distance, but terrain changes the pace for everyone.
        </p>
        <ul>
          {Object.values(TRACKS).map((t) => (
            <li key={t.id}>
              <b>{t.name}</b> · {t.blurb}
            </li>
          ))}
        </ul>
      </Section>
      <Section title="💰 Betting">
        <ul>
          <li>
            <b>Win</b> · your horse must finish first.
          </li>
          <li>
            <b>Place</b> · your horse must finish in the top three (races with four or more horses).
          </li>
          <li>
            <b>Odd / Even / Low / High</b> · bet on the winner's lane number (four or more horses).
          </li>
        </ul>
        <p>
          Odds lock before betting. Favourites pay little, long shots a lot. A closed bet would pay
          too little to offer.
        </p>
      </Section>
      <Section title="🎨 Coins and looks (office)">
        <p>
          Office coins carry over from race to race. In the lobby, spend them in the Looks shop on
          silks, trails and more, or open a crate for a random item you don't own yet.
        </p>
      </Section>
      <Section title="🏅 Badges">
        <ul>
          {Object.values(BADGES).map((b) => (
            <li key={b.name}>
              <span aria-hidden="true">{b.icon}</span> <b>{b.name}</b> · {b.description}
            </li>
          ))}
        </ul>
      </Section>
    </>
  );
}

/** "📖 Guide" button that opens the guide full screen. */
export function GuideButton() {
  const dialog = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button
        type="button"
        className="chip"
        aria-label="Guide"
        title="Game guide"
        onClick={() => dialog.current?.showModal()}
      >
        📖
      </button>
      <dialog ref={dialog} className="guide" aria-labelledby="guide-title">
        <header>
          <h2 id="guide-title">Game guide</h2>
          <button type="button" onClick={() => dialog.current?.close()}>
            Close
          </button>
        </header>
        <GuideContent />
      </dialog>
    </>
  );
}
