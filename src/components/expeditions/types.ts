import type { ExpeditionSummary } from "@/lib/expeditions/expedition-db";
import type { RoleCategory } from "@/lib/types";

/** Shapes returned by /api/expeditions (client side). */
export type ExpeditionItem = ExpeditionSummary;

export interface ExpeditionAgent {
  id: string;
  name: string;
  role: RoleCategory;
  roleTitle: string;
  spriteSeed: Record<string, number>;
}

export interface ExpeditionsView {
  expeditions: ExpeditionItem[];
  agents: ExpeditionAgent[];
  maxActive: number;
  serverNow: string;
}

/** What a claim actually granted (from /api/expeditions/claim). */
export interface ExpeditionGrant {
  gems: number;
  growth: Record<number, number>;
  ticket: boolean;
  xp: boolean;
}

/** "3:05:09" for 3h 5m 9s; "0:00" once done. */
export function formatCountdown(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}
