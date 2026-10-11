import type { Rng } from "./rng";
import type { BattleSession, SessionStore } from "./session-store";

export type ServiceResult = { status: number; body: Record<string, unknown> };

export interface ServiceDeps {
  store: SessionStore;
  rng: Rng;
  /** Runs slow follow-up work after the response (routes pass next/server `after`). Defaults to awaiting inline. */
  defer?: (task: () => Promise<void>) => void;
}

/** Runs `task` via deps.defer when provided, otherwise awaits it inline (tests, scripts). */
export async function runDeferred(deps: ServiceDeps, label: string, task: () => Promise<void>): Promise<void> {
  const guarded = () => task().catch((e) => console.error(`[${label}]`, e));
  if (deps.defer) deps.defer(guarded);
  else await guarded();
}

/** Daily usage = persisted results + still-active sessions (a fight counts from the moment it starts). */
export async function usedToday(logged: Promise<number>, store: SessionStore, filter: Parameters<SessionStore["countActiveToday"]>[0]): Promise<number> {
  return (await logged) + (await store.countActiveToday(filter));
}

export function fail(status: number, error: string): ServiceResult {
  return { status, body: { error } };
}

export interface BattleStateBase {
  round: number;
  finished: boolean;
}

/** Per-mode rules: how to parse/resolve actions and persist a finished battle. */
export interface ModeHandler<S extends BattleStateBase> {
  /** Validated action (including "auto"), or null if malformed. */
  parseAction(raw: unknown): ({ type: string } & Record<string, unknown>) | null;
  resolve(state: S, action: { type: string } & Record<string, unknown>, rng: Rng): S;
  auto(state: S, rng: Rng): S;
  /** Error code for an InvalidActionError raised by `resolve`. */
  invalidCode(action: { type: string }): string;
  /** Persists results of a finished battle; returns extra response fields. */
  finalize(session: BattleSession<S>, state: S, deps: ServiceDeps): Promise<Record<string, unknown>>;
}

/**
 * Re-checks the daily limit after creating a session: two concurrent starts can both pass the
 * pre-check, so whichever pushes usage over the limit is closed again (fails safe).
 */
export async function withinLimitAfterCreate(session: BattleSession<unknown>, used: () => Promise<number>, limit: number, deps: ServiceDeps): Promise<boolean> {
  if ((await used()) <= limit) return true;
  if (await deps.store.claimFinalize(session.id)) await deps.store.markFinished(session.id, null, { cancelled: true });
  return false;
}


