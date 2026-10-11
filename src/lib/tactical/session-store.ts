import type { SupabaseClient } from "@supabase/supabase-js";
import { getAdminSupabase } from "@/lib/supabase-admin";
import { isSupabaseConfigured } from "@/lib/supabase";
import { utcDayStartISO } from "@/lib/time";
import type { BattleMode } from "./types";

export type SessionMode = BattleMode | "squad_pvp" | "raid";
/** active → finalizing (one caller persists results) → finished. */
export type SessionStatus = "active" | "finalizing" | "finished";

export interface BattleSession<S = unknown> {
  id: string;
  mode: SessionMode;
  playerId: string;
  attackerId: string | null;
  defenderId: string | null;
  state: S;
  status: SessionStatus;
  createdAt: string;
  /** Response fields saved at finish so a client that lost the final response can recover them. */
  result?: Record<string, unknown> | null;
}

export interface SessionFilter {
  agentId?: string;
  playerId?: string;
  mode?: SessionMode;
}

export interface SessionStore {
  create<S>(s: { mode: SessionMode; playerId: string; attackerId: string | null; defenderId: string | null; state: S }): Promise<BattleSession<S>>;
  get<S>(id: string): Promise<BattleSession<S> | null>;
  findActive<S>(filter: SessionFilter): Promise<BattleSession<S>[]>;
  /** Optimistic update: succeeds only if the stored state.round equals expectedRound and the session is active. */
  updateState<S>(id: string, expectedRound: number, state: S): Promise<boolean>;
  /** Moves active → finalizing; true for exactly one caller. */
  claimFinalize(id: string): Promise<boolean>;
  /** Moves finalizing → active after a failed finalisation so it can be retried. */
  releaseFinalize(id: string): Promise<void>;
  markFinished(id: string, battleLogId: string | null, result?: Record<string, unknown>): Promise<void>;
  countActiveToday(filter: SessionFilter & { mode: SessionMode }): Promise<number>;
  /** Active sessions created before the cutoff (abandoned fights to sweep). */
  findStale<S>(beforeISO: string): Promise<BattleSession<S>[]>;
}

const todayStartISO = () => utcDayStartISO();

function roundOf(state: unknown): number {
  return (state as { round: number }).round;
}

// ---------------------------------------------------------------------------
// In-memory (demo mode + tests)
// ---------------------------------------------------------------------------

export class MemorySessionStore implements SessionStore {
  private sessions = new Map<string, BattleSession>();

  private matches(s: BattleSession, f: SessionFilter): boolean {
    if (f.mode && s.mode !== f.mode) return false;
    if (f.playerId && s.playerId !== f.playerId) return false;
    if (f.agentId && s.attackerId !== f.agentId && s.defenderId !== f.agentId) return false;
    return true;
  }

  async create<S>(s: { mode: SessionMode; playerId: string; attackerId: string | null; defenderId: string | null; state: S }) {
    const session: BattleSession<S> = { ...s, id: crypto.randomUUID(), status: "active", createdAt: new Date().toISOString(), state: structuredClone(s.state) };
    this.sessions.set(session.id, session as BattleSession);
    return structuredClone(session);
  }

  async get<S>(id: string) {
    const s = this.sessions.get(id);
    return s ? (structuredClone(s) as BattleSession<S>) : null;
  }

  async findActive<S>(filter: SessionFilter) {
    return [...this.sessions.values()]
      .filter((s) => s.status === "active" && this.matches(s, filter))
      .map((s) => structuredClone(s) as BattleSession<S>);
  }

  async updateState<S>(id: string, expectedRound: number, state: S) {
    const s = this.sessions.get(id);
    if (!s || s.status !== "active" || roundOf(s.state) !== expectedRound) return false;
    s.state = structuredClone(state);
    return true;
  }

  async claimFinalize(id: string) {
    const s = this.sessions.get(id);
    if (!s || s.status !== "active") return false;
    s.status = "finalizing";
    return true;
  }

  async releaseFinalize(id: string) {
    const s = this.sessions.get(id);
    if (s && s.status === "finalizing") s.status = "active";
  }

  async markFinished(id: string, _battleLogId: string | null, result?: Record<string, unknown>) {
    const s = this.sessions.get(id);
    if (!s) return;
    s.status = "finished";
    s.result = result ? structuredClone(result) : null;
  }

  async countActiveToday(filter: SessionFilter & { mode: SessionMode }) {
    const since = todayStartISO();
    return [...this.sessions.values()].filter((s) => s.status === "active" && s.createdAt >= since && this.matches(s, filter)).length;
  }

  async findStale<S>(beforeISO: string) {
    return [...this.sessions.values()]
      .filter((s) => s.status === "active" && s.createdAt < beforeISO)
      .map((s) => structuredClone(s) as BattleSession<S>);
  }
}

// ---------------------------------------------------------------------------
// Supabase (service role; table has no anon policies)
// ---------------------------------------------------------------------------

const TABLE = "levelup_battle_sessions";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow<S>(row: any): BattleSession<S> {
  return {
    id: row.id,
    mode: row.mode,
    playerId: row.player_id,
    attackerId: row.attacker_id,
    defenderId: row.defender_id,
    state: row.state,
    status: row.status,
    createdAt: row.created_at,
    result: row.result ?? null,
  };
}

export class SupabaseSessionStore implements SessionStore {
  constructor(private sb: SupabaseClient) {}

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private applyFilter(q: any, f: SessionFilter) {
    if (f.mode) q = q.eq("mode", f.mode);
    if (f.playerId) q = q.eq("player_id", f.playerId);
    if (f.agentId) q = q.or(`attacker_id.eq.${f.agentId},defender_id.eq.${f.agentId}`);
    return q;
  }

  async create<S>(s: { mode: SessionMode; playerId: string; attackerId: string | null; defenderId: string | null; state: S }) {
    const { data, error } = await this.sb
      .from(TABLE)
      .insert({ mode: s.mode, player_id: s.playerId, attacker_id: s.attackerId, defender_id: s.defenderId, state: s.state })
      .select("*")
      .single();
    if (error) throw error;
    return mapRow<S>(data);
  }

  async get<S>(id: string) {
    const { data, error } = await this.sb.from(TABLE).select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    return data ? mapRow<S>(data) : null;
  }

  async findActive<S>(filter: SessionFilter) {
    const { data, error } = await this.applyFilter(this.sb.from(TABLE).select("*").eq("status", "active"), filter);
    if (error) throw error;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data ?? []).map((r: any) => mapRow<S>(r));
  }

  async updateState<S>(id: string, expectedRound: number, state: S) {
    const { data, error } = await this.sb
      .from(TABLE)
      .update({ state, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("status", "active")
      .eq("state->>round", String(expectedRound))
      .select("id");
    if (error) throw error;
    return (data ?? []).length === 1;
  }

  async claimFinalize(id: string) {
    const { data, error } = await this.sb
      .from(TABLE)
      .update({ status: "finalizing", updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("status", "active")
      .select("id");
    if (error) throw error;
    return (data ?? []).length === 1;
  }

  async releaseFinalize(id: string) {
    const { error } = await this.sb.from(TABLE).update({ status: "active" }).eq("id", id).eq("status", "finalizing");
    if (error) throw error;
  }

  async markFinished(id: string, battleLogId: string | null, result?: Record<string, unknown>) {
    const { error } = await this.sb
      .from(TABLE)
      .update({ status: "finished", battle_log_id: battleLogId, result: result ?? null, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
  }

  async findStale<S>(beforeISO: string) {
    const { data, error } = await this.sb.from(TABLE).select("*").eq("status", "active").lt("created_at", beforeISO).limit(200);
    if (error) throw error;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data ?? []).map((r: any) => mapRow<S>(r));
  }

  async countActiveToday(filter: SessionFilter & { mode: SessionMode }) {
    const { count, error } = await this.applyFilter(
      this.sb.from(TABLE).select("id", { count: "exact", head: true }).eq("status", "active").gte("created_at", todayStartISO()),
      filter
    );
    if (error) throw error;
    return count ?? 0;
  }
}

let memoryStore: MemorySessionStore | null = null;

export function getSessionStore(): SessionStore {
  const admin = getAdminSupabase();
  if (admin) return new SupabaseSessionStore(admin);
  if (isSupabaseConfigured) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
  memoryStore ??= new MemorySessionStore();
  return memoryStore;
}
