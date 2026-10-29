import { MIN_HORSES } from '../sim/config.ts';

/** Same alphabet as create_room in SQL: no I, L, O, 0, 1. */
const CODE_RE = /^[A-HJKMNP-Z2-9]{4}$/;

export function normalizeCode(input: string): string | null {
  const code = input.trim().toUpperCase();
  return CODE_RE.test(code) ? code : null;
}

export const joinUrl = (origin: string, code: string) => `${origin}/play?code=${code}`;

export const canOpenShop = (players: readonly { ticked: boolean }[]) =>
  players.filter((p) => p.ticked).length >= MIN_HORSES;
