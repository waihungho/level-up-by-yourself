/** Start of the current UTC day as an ISO string (daily limits reset at 00:00 UTC). */
/** Today's UTC date as YYYY-MM-DD. */
export function utcToday(now: Date = new Date()): string {
  return utcDayStartISO(now).slice(0, 10);
}

export function utcDayStartISO(now: Date = new Date()): string {
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}
