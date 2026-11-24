import type { DimensionCategory } from "@/lib/types";
import type { SessionKind } from "@/lib/life/catalog";

export interface LifeHabit {
  id: string;
  name: string;
  category: DimensionCategory;
  streak: number;
  checkedToday: boolean;
  nextPoints: number;
}

export interface LifeQuestItem {
  id: string;
  text: string;
  category: DimensionCategory;
  points: number;
  done: boolean;
}

export interface LifeOpenSession {
  id: string;
  kind: SessionKind;
  agentId: string;
  minutes: number;
  startedAt: string;
}

export interface LifeView {
  today: string;
  cap: number;
  todayPoints: number;
  streak: number;
  habits: LifeHabit[];
  maxHabits: number;
  quests: LifeQuestItem[];
  stepsToday: number | null;
  openSession: LifeOpenSession | null;
  agents: { id: string; name: string; role: string; roleTitle: string }[];
  serverNow: string;
}

export const LIFE_ERRORS: Record<string, string> = {
  daily_cap: "You've reached today's real-life growth cap. Come back tomorrow!",
  already_done: "Already done today.",
  habit_limit: "You can track up to 5 habits. Remove one first.",
  invalid_name: "Give the habit a name (up to 40 characters).",
  invalid_steps: "Enter a step count between 1 and 100,000.",
  session_open: "Finish or cancel your current session first.",
  too_early: "Not done yet. Keep going!",
  not_owner: "Pick one of your own agents.",
  not_found: "That's no longer available. Refreshing…",
  network: "Network error. Please try again.",
};

export const CATEGORY_COLOR: Record<DimensionCategory, string> = {
  Physical: "text-red-400",
  Mental: "text-blue-400",
  Social: "text-green-400",
  Spiritual: "text-purple-400",
  Technical: "text-cyan-400",
};

/** Sends JSON with any method; never throws (a network failure comes back as status 0). */
export async function sendJson(method: "POST" | "PATCH" | "DELETE", url: string, body: unknown): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  try {
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return { ok: res.ok, status: res.status, data: await res.json().catch(() => ({})) };
  } catch {
    return { ok: false, status: 0, data: { error: "network" } };
  }
}
