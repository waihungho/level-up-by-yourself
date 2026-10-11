import type { Rng } from "./rng";
import type { BattleSession, SessionStore } from "./session-store";

export type ServiceResult = { status: number; body: Record<string, unknown> };

export interface ServiceDeps {
  store: SessionStore;
  rng: Rng;
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
