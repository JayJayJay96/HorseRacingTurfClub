import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Older Windows 10 emoji fonts (the office PCs) stop at Emoji 12, so newer emoji show as an empty
 * box. These ranges hold every Emoji 13+ character; the whole U+1FA70 block is Emoji 12+ anyway.
 */
const TOO_NEW: readonly (readonly [number, number])[] = [
  [0x1fa70, 0x1faff], // Symbols and Pictographs Extended-A
  [0x1f6d6, 0x1f6d7],
  [0x1f6fb, 0x1f6fc],
  [0x1f90c, 0x1f90c],
  [0x1f972, 0x1f972],
  [0x1f977, 0x1f978],
  [0x1f9a3, 0x1f9a4],
  [0x1f9ab, 0x1f9ad],
  [0x1f9cb, 0x1f9cc],
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(tsx?|css)$/.test(name) ? [path] : [];
  });
}

describe('emoji support', () => {
  it('uses no emoji newer than older Windows fonts can draw', () => {
    const found: string[] = [];
    for (const file of sourceFiles('src')) {
      for (const ch of readFileSync(file, 'utf8')) {
        const cp = ch.codePointAt(0)!;
        if (TOO_NEW.some(([lo, hi]) => cp >= lo && cp <= hi)) {
          found.push(`${file}: ${ch} U+${cp.toString(16).toUpperCase()}`);
        }
      }
    }
    expect(found).toEqual([]);
  });
});
