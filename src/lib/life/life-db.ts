import { getWriteClient } from "@/lib/supabase-admin";
import { applyGrowthAtomic } from "@/lib/shop/shop-db";
import type { DimensionCategory } from "@/lib/types";
import { round2, type LifeKind, type SessionKind } from "./catalog";

export interface Habit {
  id: string;
  playerId: string;
  name: string;
  category: DimensionCategory;
  createdAt: string;
}

export interface LifeLog {
  kind: LifeKind;
  ref: string;
  day: string;
  points: number;
  agentId: string | null;
}

export interface LifeSession {
  id: string;
  playerId: string;
  agentId: string;
  kind: SessionKind;
  minutes: number;
  startedAt: string;
  finishedAt: string | null;
}

export type GrantResult = { result: "ok" | "duplicate" | "cap"; granted: number; total: number };
export type FinishResult = GrantResult | { result: "not_found"; granted: 0; total: 0 } | { result: "too_early"; granted: 0; total: 0 };

/** Demo-mode (no Supabase) store; tests reset it with resetLifeMemory(). */
export const lifeMem = {
  habits: [] as (Habit & { archivedAt: string | null })[],
  logs: [] as (LifeLog & { playerId: string })[],
  sessions: [] as LifeSession[],
};

export function resetLifeMemory(): void {
  lifeMem.habits = [];
  lifeMem.logs = [];
  lifeMem.sessions = [];
}

const iso = (t: string) => new Date(t).toISOString();

// ---------------------------------------------------------------------------
// Habits
// ---------------------------------------------------------------------------

const toHabit = (h: Habit): Habit => ({ id: h.id, playerId: h.playerId, name: h.name, category: h.category, createdAt: h.createdAt });

export async function getHabits(playerId: string): Promise<Habit[]> {
  const sb = getWriteClient();
  if (sb) {
    const { data, error } = await sb
      .from("levelup_life_habits")
      .select("id, player_id, name, category, created_at")
      .eq("player_id", playerId)
      .is("archived_at", null)
      .order("created_at");
    if (error) throw error;
    return (data ?? []).map((r) => ({ id: r.id, playerId: r.player_id, name: r.name, category: r.category, createdAt: iso(r.created_at) }));
  }
  return lifeMem.habits.filter((h) => h.playerId === playerId && !h.archivedAt).map(toHabit);
}

/** Inserts a habit. The MAX_HABITS check lives in the service: habits grant nothing by themselves, so a race past it is harmless. */
export async function insertHabit(input: { playerId: string; name: string; category: DimensionCategory }): Promise<Habit> {
  const sb = getWriteClient();
  if (sb) {
    const { data, error } = await sb
      .from("levelup_life_habits")
      .insert({ player_id: input.playerId, name: input.name, category: input.category })
      .select("id, player_id, name, category, created_at")
      .single();
    if (error) throw error;
    return { id: data.id, playerId: data.player_id, name: data.name, category: data.category, createdAt: iso(data.created_at) };
  }
  const habit = { ...input, id: crypto.randomUUID(), createdAt: new Date().toISOString(), archivedAt: null };
  lifeMem.habits.push(habit);
  return toHabit(habit);
}

/** Archives the player's habit; false when it isn't theirs or is already archived. */
export async function archiveHabit(playerId: string, habitId: string): Promise<boolean> {
  const sb = getWriteClient();
  if (sb) {
    const { data, error } = await sb
      .from("levelup_life_habits")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", habitId)
      .eq("player_id", playerId)
      .is("archived_at", null)
      .select("id");
    if (error) throw error;
    return (data ?? []).length > 0;
  }
  const habit = lifeMem.habits.find((h) => h.id === habitId && h.playerId === playerId && !h.archivedAt);
  if (!habit) return false;
  habit.archivedAt = new Date().toISOString();
  return true;
}

// ---------------------------------------------------------------------------
// Logs and grants
// ---------------------------------------------------------------------------

/** The player's logs from `sinceDay` (inclusive) on. */
export async function getLifeLogs(playerId: string, sinceDay: string): Promise<LifeLog[]> {
  const sb = getWriteClient();
  if (sb) {
    const { data, error } = await sb
      .from("levelup_life_logs")
      .select("kind, ref, day, points, agent_id")
      .eq("player_id", playerId)
      .gte("day", sinceDay);
    if (error) throw error;
    return (data ?? []).map((r) => ({ kind: r.kind, ref: r.ref, day: r.day, points: Number(r.points), agentId: r.agent_id }));
  }
  return lifeMem.logs
    .filter((l) => l.playerId === playerId && l.day >= sinceDay)
    .map((l) => ({ kind: l.kind, ref: l.ref, day: l.day, points: l.points, agentId: l.agentId }));
}

export interface GrantInput {
  playerId: string;
  agentId: string;
  kind: LifeKind;
  ref: string;
  day: string;
  points: number;
  growth: Record<number, number>;
  cap: number;
}

/** Records one real-life grant and applies its growth under the daily cap, atomically per player. */
export async function grantLife(input: GrantInput): Promise<GrantResult> {
  const sb = getWriteClient();
  if (sb) {
    const { data, error } = await sb.rpc("levelup_life_grant", {
      p_player: input.playerId,
      p_agent: input.agentId,
      p_kind: input.kind,
      p_ref: input.ref,
      p_day: input.day,
      p_points: input.points,
      p_growth: input.growth,
      p_cap: input.cap,
    });
    if (error) throw error;
    return toGrant(Array.isArray(data) ? data[0] : data);
  }
  return grantMem(input);
}

function toGrant(row: { result: string; granted: number | null; total: number | null }): GrantResult {
  return { result: row.result as GrantResult["result"], granted: round2(Number(row.granted ?? 0)), total: round2(Number(row.total ?? 0)) };
}

/** Demo mode: every check and the log insert happen before the first await, so they are atomic in JS. */
async function grantMem(input: GrantInput): Promise<GrantResult> {
  const today = lifeMem.logs.filter((l) => l.playerId === input.playerId && l.day === input.day);
  const total = round2(today.reduce((s, l) => s + l.points, 0));
  if (today.some((l) => l.kind === input.kind && l.ref === input.ref)) return { result: "duplicate", granted: 0, total };
  if (total >= input.cap) return { result: "cap", granted: 0, total };
  const granted = round2(Math.min(input.points, input.cap - total));
  const factor = input.points > 0 ? granted / input.points : 0;
  const scaled = Object.fromEntries(Object.entries(input.growth).map(([k, v]) => [Number(k), round2(v * factor)]));
  const log = { playerId: input.playerId, agentId: input.agentId, kind: input.kind, ref: input.ref, day: input.day, points: granted };
  lifeMem.logs.push(log);
  try {
    await applyGrowthAtomic(input.agentId, scaled);
  } catch (e) {
    lifeMem.logs.splice(lifeMem.logs.indexOf(log), 1);
    throw e;
  }
  return { result: "ok", granted, total: round2(total + granted) };
}

// ---------------------------------------------------------------------------
// Timed sessions
// ---------------------------------------------------------------------------

const SESSION_COLUMNS = "id, player_id, agent_id, kind, minutes, started_at, finished_at";

function mapSession(r: Record<string, unknown>): LifeSession {
  return {
    id: r.id as string,
    playerId: r.player_id as string,
    agentId: r.agent_id as string,
    kind: r.kind as SessionKind,
    minutes: Number(r.minutes),
    startedAt: iso(r.started_at as string),
    finishedAt: r.finished_at ? iso(r.finished_at as string) : null,
  };
}

export async function getOpenSession(playerId: string): Promise<LifeSession | null> {
  const sb = getWriteClient();
  if (sb) {
    const { data, error } = await sb.from("levelup_life_sessions").select(SESSION_COLUMNS).eq("player_id", playerId).is("finished_at", null).maybeSingle();
    if (error) throw error;
    return data ? mapSession(data) : null;
  }
  const s = lifeMem.sessions.find((x) => x.playerId === playerId && !x.finishedAt);
  return s ? { ...s } : null;
}

/** Starts a session; null when the player already has one open. */
export async function insertSession(input: { playerId: string; agentId: string; kind: SessionKind; minutes: number; startedAt: string }): Promise<LifeSession | null> {
  const sb = getWriteClient();
  if (sb) {
    const { data, error } = await sb
      .from("levelup_life_sessions")
      .insert({ player_id: input.playerId, agent_id: input.agentId, kind: input.kind, minutes: input.minutes, started_at: input.startedAt })
      .select(SESSION_COLUMNS)
      .single();
    if (error) {
      if (error.code === "23505") return null;
      throw error;
    }
    return mapSession(data);
  }
  if (lifeMem.sessions.some((s) => s.playerId === input.playerId && !s.finishedAt)) return null;
  const session: LifeSession = { ...input, id: crypto.randomUUID(), finishedAt: null };
  lifeMem.sessions.push(session);
  return { ...session };
}

/** Deletes the player's open session (giving up); false when there was none with that id. */
export async function cancelSession(playerId: string, sessionId: string): Promise<boolean> {
  const sb = getWriteClient();
  if (sb) {
    const { data, error } = await sb.from("levelup_life_sessions").delete().eq("id", sessionId).eq("player_id", playerId).is("finished_at", null).select("id");
    if (error) throw error;
    return (data ?? []).length > 0;
  }
  const i = lifeMem.sessions.findIndex((s) => s.id === sessionId && s.playerId === playerId && !s.finishedAt);
  if (i < 0) return false;
  lifeMem.sessions.splice(i, 1);
  return true;
}

/** Finishes a session whose time is up (by `now`) and grants it, in one transaction. */
export async function finishSession(input: {
  playerId: string;
  sessionId: string;
  now: Date;
  graceS: number;
  day: string;
  points: number;
  growth: Record<number, number>;
  cap: number;
}): Promise<FinishResult> {
  const sb = getWriteClient();
  if (sb) {
    const { data, error } = await sb.rpc("levelup_life_finish_session", {
      p_id: input.sessionId,
      p_player: input.playerId,
      p_now: input.now.toISOString(),
      p_grace_s: input.graceS,
      p_day: input.day,
      p_points: input.points,
      p_growth: input.growth,
      p_cap: input.cap,
    });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    if (row.result === "not_found" || row.result === "too_early") return { result: row.result, granted: 0, total: 0 };
    return toGrant(row);
  }

  const s = lifeMem.sessions.find((x) => x.id === input.sessionId && x.playerId === input.playerId && !x.finishedAt);
  if (!s) return { result: "not_found", granted: 0, total: 0 };
  const due = Date.parse(s.startedAt) + s.minutes * 60_000 - input.graceS * 1000;
  if (input.now.getTime() < due) return { result: "too_early", granted: 0, total: 0 };
  s.finishedAt = input.now.toISOString();
  try {
    return await grantMem({ playerId: s.playerId, agentId: s.agentId, kind: s.kind, ref: s.id, day: input.day, points: input.points, growth: input.growth, cap: input.cap });
  } catch (e) {
    s.finishedAt = null;
    throw e;
  }
}
