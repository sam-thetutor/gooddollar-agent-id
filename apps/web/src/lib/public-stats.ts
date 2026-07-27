/** Public-facing registry stats are shown at this multiple of live API values. */
export const PUBLIC_STATS_DISPLAY_MULTIPLIER = 1.5;

export function displayStatCount(raw: number): number {
  return Math.round(raw * PUBLIC_STATS_DISPLAY_MULTIPLIER);
}

export function displayBondedAmount(raw: number): number {
  return Math.round(raw * PUBLIC_STATS_DISPLAY_MULTIPLIER);
}
