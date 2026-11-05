import { ordinal } from '../betting/betting.ts';
import type { ItemCode, RaceEvent } from '../sim/types.ts';

/** Names and one-line effects: race popups, commentary, the phone Guide. No numbers in `desc`. */
export const ITEM_INFO: Readonly<Record<ItemCode, { name: string; icon: string; desc: string }>> = {
  'speed:self1': { name: 'Carrot', icon: '🥕', desc: 'One quick burst of speed.' },
  'speed:self3': {
    name: 'Golden Carrot',
    icon: '✨',
    desc: 'Three quick bursts of speed, a few seconds apart.',
  },
  'speed:star': { name: 'Thunder Hooves', icon: '⚡', desc: 'One long burst of speed.' },
  'speed:pass3': {
    name: 'Stampede',
    icon: '🐎',
    desc: 'Rare, mystery boxes only, back half of the field: charge past three horses.',
  },
  'attack:behind1': {
    name: 'Banana Peel',
    icon: '🍌',
    desc: 'Badly slows the horse right behind you.',
  },
  'attack:behind3': {
    name: 'Dust Kick',
    icon: '💨',
    desc: 'Slows the three horses behind you a little.',
  },
  'attack:front1': {
    name: 'Horseshoe Toss',
    icon: '🧲',
    desc: 'Badly slows the horse right ahead of you.',
  },
  'attack:front3': {
    name: 'Mud Cloud',
    icon: '🌫️',
    desc: 'Slows the three horses ahead of you a little.',
  },
  'attack:leader': {
    name: 'Golden Lasso',
    icon: '➰',
    desc: 'Stops the race leader dead for a moment.',
  },
  'attack:top3': {
    name: 'Hornet Swarm',
    icon: '🐝',
    desc: 'Slows the top three (never you) for a while.',
  },
  'attack:all': {
    name: 'Thunderclap',
    icon: '🌩️',
    desc: 'Rare, mystery boxes only, last place only: slows every other horse.',
  },
  'defense:block1': {
    name: 'Horseshoe Shield',
    icon: '🛡️',
    desc: 'Kept until the next attack on you, then blocks it.',
  },
  'defense:immune': {
    name: 'Lucky Bubble',
    icon: '🔮',
    desc: 'No attack can touch you for a few seconds.',
  },
  'defense:reflect': {
    name: 'Mirror Saddle',
    icon: '🔁',
    desc: 'Kept until the next attack on you, then bounces it back at the thrower.',
  },
  'dud:stop': { name: 'Snack Break', icon: '🍩', desc: 'Bad luck: you stop for a moment.' },
  'dud:slow': {
    name: 'Sleepy Jockey',
    icon: '😴',
    desc: 'Bad luck: you slow down for a few seconds.',
  },
  'dud:trip': { name: 'Stumble', icon: '🤕', desc: 'Bad luck: a short, sharp slowdown.' },
};

/** Text that floats above `event.horse`. */
export function popupOf(event: RaceEvent): string {
  switch (event.type) {
    case 'pickup':
      return event.item
        ? `${event.hot ? '🔥 ' : ''}${ITEM_INFO[event.item].icon} ${ITEM_INFO[event.item].name}`
        : '💨 Fizzled';
    case 'hit':
      return `${ITEM_INFO[event.item].icon} Hit!`;
    case 'blocked':
      return event.reason === 'immune' ? '🔮 Immune' : '🛡️ Blocked';
    case 'reflected':
      return '🔁 Reflected!';
    case 'stumble':
      return '🚧 Stumble!';
    case 'slip':
      return '💦 Slip!';
    case 'bump':
      return '💥 Bump!';
    case 'finish':
      return `🏁 ${ordinal(event.place)}`;
  }
}
