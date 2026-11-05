/** Spec §9 badges (luck, not skill). Codes match the badges table check constraint. */
export const BADGES = {
  first_win: { icon: '🥇', name: 'First Win', description: 'Won an office race.' },
  hat_trick: { icon: '🎩', name: 'Hat-trick', description: 'Won three races in a row.' },
  photo_finish: { icon: '📸', name: 'Photo Finish', description: 'Won by less than 0.2 s.' },
  comeback: { icon: '🔄', name: 'Comeback', description: 'Last at halfway, then won.' },
  banana_king: {
    icon: '🍌',
    name: 'Banana King',
    description: 'Landed the most attacks in a race.',
  },
  untouchable: { icon: '👻', name: 'Untouchable', description: 'Won without being hit.' },
  long_shot: { icon: '🎯', name: 'Long Shot', description: 'Won a bet at 10× or more.' },
  big_spender: { icon: '💸', name: 'Big Spender', description: 'Bought 3 boxes in 5 races.' },
  broke: { icon: '💸', name: 'Broke', description: 'Hit the 50-coin floor.' },
  sniper: { icon: '➰', name: 'Sniper', description: 'Golden Lasso hit the leader.' },
} as const;
export type BadgeCode = keyof typeof BADGES;

/** Racing-form style: newest first, "0" for 10th or worse. */
export const formatForm = (last5: readonly number[]) =>
  last5.length === 0 ? '–' : last5.map((p) => (p >= 10 ? '0' : String(p))).join('-');
