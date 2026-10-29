/** Pearson chi-square statistic of observed counts against expected shares (shares sum to 1). */
export function chiSquare(counts: readonly number[], shares: readonly number[]): number {
  const total = counts.reduce((sum, c) => sum + c, 0);
  return counts.reduce((sum, c, i) => {
    const expected = total * shares[i]!;
    return sum + (c - expected) ** 2 / expected;
  }, 0);
}
