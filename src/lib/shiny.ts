/**
 * Shiny agents: a rare, purely cosmetic variant (alternate palette + sparkles, no stat effect).
 * Decided by the agent's id, which the database assigns, so the browser can't forge it and
 * agents summoned before this feature existed can be shiny too. Pure and client-safe.
 */

/** One agent in SHINY_ODDS is shiny. */
export const SHINY_ODDS = 64;

/** Hue rotation (degrees) applied to a shiny agent's whole palette. */
export const SHINY_HUE_SHIFT = 150;

/** Sparkle colours drawn around a shiny sprite. */
export const SHINY_SPARKLE = "#fff7c2";
export const SHINY_SPARKLE_CORE = "#ffffff";

/** 32-bit FNV-1a over the UTF-16 code units of `s`. */
function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Ids are case-insensitive uuids, so normalise before hashing. */
export function isShiny(agentId: string | null | undefined): boolean {
  if (!agentId) return false;
  return fnv1a(agentId.trim().toLowerCase()) % SHINY_ODDS === 0;
}
