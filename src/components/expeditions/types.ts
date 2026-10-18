import type { ExpeditionDuration, ExpeditionReward } from "@/lib/expeditions/catalog";
import type { RoleCategory } from "@/lib/types";

/** Shapes returned by /api/expeditions (client side). */
export interface ExpeditionItem {
  id: string;
  agentId: string;
  durationH: ExpeditionDuration;
  startedAt: string;
  endsAt: string;
  reward: ExpeditionReward;
}

export interface ExpeditionAgent {
  id: string;
  name: string;
  role: RoleCategory;
  roleTitle: string;
  spriteSeed: Record<string, unknown>;
}

export interface ExpeditionsView {
  expeditions: ExpeditionItem[];
  agents: ExpeditionAgent[];
  maxActive: number;
  serverNow: string;
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
