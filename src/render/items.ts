import { ordinal } from '../betting/betting.ts';
import type { ItemCode, RaceEvent } from '../sim/types.ts';

export const ITEM_INFO: Readonly<Record<ItemCode, { name: string; icon: string }>> = {
  'speed:self1': { name: 'Carrot', icon: '🥕' },
  'speed:self3': { name: 'Golden Carrot', icon: '✨' },
  'speed:star': { name: 'Thunder Hooves', icon: '⚡' },
  'speed:pass3': { name: 'Stampede', icon: '🐎' },
  'attack:behind1': { name: 'Banana Peel', icon: '🍌' },
  'attack:behind3': { name: 'Dust Kick', icon: '💨' },
  'attack:front1': { name: 'Horseshoe Toss', icon: '🧲' },
  'attack:front3': { name: 'Mud Cloud', icon: '🌫️' },
  'attack:leader': { name: 'Golden Lasso', icon: '➰' },
  'attack:top3': { name: 'Hornet Swarm', icon: '🐝' },
  'attack:all': { name: 'Thunderclap', icon: '🌩️' },
  'defense:block1': { name: 'Horseshoe Shield', icon: '🛡️' },
  'defense:immune': { name: 'Lucky Bubble', icon: '🔮' },
  'defense:reflect': { name: 'Mirror Saddle', icon: '🔁' },
  'dud:stop': { name: 'Snack Break', icon: '🍩' },
  'dud:slow': { name: 'Sleepy Jockey', icon: '😴' },
  'dud:trip': { name: 'Stumble', icon: '🤕' },
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
    case 'slip':
      return '💦 Slip!';
    case 'bump':
      return '💥 Bump!';
    case 'finish':
      return `🏁 ${ordinal(event.place)}`;
  }
}
