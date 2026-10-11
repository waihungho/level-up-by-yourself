/** Start of the current UTC day as an ISO string (daily limits reset at 00:00 UTC). */
export function utcDayStartISO(now: Date = new Date()): string {
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}
