/* Season Pass calendar and XP sources. Pure (no DB imports) so pages can use it. */

/** Season 1 starts Monday 2026-10-19 00:00 UTC; every season lasts 14 days. */
export const SEASON_EPOCH_MS = Date.UTC(2026, 9, 19);
export const SEASON_DAYS = 14;
const SEASON_MS = SEASON_DAYS * 86_400_000;

/** Season number for a moment (season 1 for anything before the epoch too). */
export function seasonOf(now: Date = new Date()): number {
  return Math.max(1, Math.floor((now.getTime() - SEASON_EPOCH_MS) / SEASON_MS) + 1);
}

export function seasonBounds(season: number): { start: string; end: string } {
  const start = SEASON_EPOCH_MS + (season - 1) * SEASON_MS;
  return { start: new Date(start).toISOString(), end: new Date(start + SEASON_MS).toISOString() };
}

export type XpSource = "login" | "fight" | "squad" | "raid" | "expedition" | "blink_challenger" | "blink_defender";

/** XP per activity. Login XP grows with the streak (see loginXp). */
export const XP: Record<Exclude<XpSource, "login">, number> = {
  fight: 15,
  squad: 30,
  raid: 50,
  expedition: 25,
  blink_challenger: 20,
  blink_defender: 10,
};

/** Daily check-in XP: 50 on day 1, +10 per consecutive day, up to 150. */
export function loginXp(streak: number): number {
  return 50 + 10 * Math.min(Math.max(streak, 1) - 1, 10);
}
