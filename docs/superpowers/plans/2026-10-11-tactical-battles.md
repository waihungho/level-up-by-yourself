# Tactical Battles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace one-click random battles (training + PvP) with server-authoritative, turn-based tactical battles (intent telegraph, category counter cycle, Guard, role Specials, Auto).

**Architecture:** A pure, RNG-injected engine (`src/lib/tactical/*`) holds all combat rules. A `battle-service` module runs start/turn/finalise logic against a `SessionStore` (Supabase service-role in prod, in-memory in demo/tests) and the existing `db.ts` helpers. Thin Next.js route handlers wrap the service. A new `TacticalBattle` client component drives turns.

**Tech Stack:** Next.js 16 App Router (route handlers), React 19, TypeScript, Supabase (`@supabase/supabase-js` v2), Vitest + Testing Library (jsdom), Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-10-11-tactical-battles-design.md`

## Global Constraints

- Category cycle: `Physical → Technical → Mental → Spiritual → Social → Physical` (a beats the next).
- Counter: ×1.5 damage, opponent strike −50%, +1 Focus. Guard: incoming −60%, +1 Focus. Focus max 5, +1 per round end. Special cost 3.
- Specials: medieval Shield Bash (Physical ×2.0 + stun), future Overclock (Technical ×1.8 ignores defense), modern Insight (Mental ×1.3, next 2 rounds +25% dmg and no feints).
- Max 12 rounds; on cap higher HP% wins; exact tie → defender.
- Feint chance = `clamp(socialAvg / (socialAvg + 120), 0.05, 0.25)`, never while the attacker has Insight active.
- Mastery bonus: attacker growth × `min(1 + 0.1 × counters, 1.5)` only if `manualActions > 0`.
- Limits unchanged: 3 training + 3 PvP fights per agent per UTC day; a fight is consumed at session start.
- Balance targets: equal stats AI-vs-AI median rounds 6–10 and win rate 45–55%; scripted counter-player vs AI 65–80%; +20% stats vs optimal underdog ≥55%.
- New env `SUPABASE_SERVICE_ROLE_KEY` (server-only, never `NEXT_PUBLIC_`).
- Baseline: before this work `pnpm test` already has 3 failing files (`scripts/__tests__/daily-growth.test.ts` import path, `db.test.ts` + `integration.test.ts` shared demo state). Do not count them as regressions; do not let new tests add to them.

## Review Focus

- Double-tap / retry on a turn → second request returns 409 `stale_round`, state applied once (Task 5 test).
- Player abandons a fight then starts another with the same agent → old session auto-resolved and logged exactly once, fight not refunded (Task 5 test).
- Special pressed with Focus < 3 (crafted request) → 400 `invalid_action`, no state change (Task 5 test).
- Player stunned by an enemy Shield Bash → their submitted action is ignored that round, UI shows a single Continue button (Task 2 + Task 7 tests).
- Old non-tactical battle logs still render in history (`BattleRound` fields optional) (Task 1 typecheck + existing tests).

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/tactical/types.ts` | Engine types |
| `src/lib/tactical/constants.ts` | Cycle, tuning constants |
| `src/lib/tactical/rng.ts` | `Rng` type, `mulberry32`, `defaultRng` |
| `src/lib/tactical/engine.ts` | Pure combat rules |
| `src/lib/tactical/session-store.ts` | `SessionStore` + Memory/Supabase impls + `getSessionStore()` |
| `src/lib/tactical/battle-service.ts` | `startBattle`, `takeTurn`, `getSessionView`, `finalizeSession` |
| `src/lib/supabase-admin.ts` | `getAdminSupabase()` service-role client |
| `src/app/api/battle/start/route.ts`, `turn/route.ts`, `session/[id]/route.ts` | Thin handlers |
| `src/components/CounterWheel.tsx` | SVG cycle diagram |
| `src/components/TacticalBattle.tsx` | Turn UI |
| `src/app/battle/page.tsx` | Wire training + PvP to tactical |
| `supabase/migrations/003_tactical_battles.sql` | Sessions table, log columns, index |
| Modify `src/lib/types.ts`, `src/lib/battle-engine.ts` (export `calculateGrowth`), `src/lib/db.ts` | Shared types/helpers |

---

### Task 1: Types, constants, RNG, shared type extensions

**Files:** Create `src/lib/tactical/{types,constants,rng}.ts`; Modify `src/lib/types.ts`, `src/lib/battle-engine.ts`; Test `src/lib/tactical/__tests__/rng.test.ts`

**Interfaces — Produces:**
```ts
// types.ts
export type Category = DimensionCategory;
export type Intent = { kind: "strike"; category: Category } | { kind: "special" } | { kind: "stunned" } | { kind: "ultimate"; category: Category }; // ultimate: boss only (raids)
export type PlayerAction = { type: "strike"; category: Category } | { type: "guard" } | { type: "special" };
export type Action = PlayerAction | { type: "auto" };
export type BattleMode = "training" | "pvp";
export type SideKey = "attacker" | "defender";
export interface SideState { agentId: string; role: RoleCategory; hp: number; maxHp: number; focus: number; stunned: boolean; insightRounds: number; catAvg: Record<Category, number>; speed: number; }
export interface TacticalRound extends BattleRound { playerAction: "strike"|"guard"|"special"|"stunned"; actionCategory?: Category; opponentIntent: string; opponentAction: string; countered: boolean; feint: boolean; special?: string; }
export interface TacticalState { mode: BattleMode; round: number; sides: Record<SideKey, SideState>; intent: Intent; manualActions: number; counters: number; rounds: TacticalRound[]; finished: boolean; winner: SideKey | null; }
export class InvalidActionError extends Error {}
// rng.ts
export type Rng = () => number;            // [0,1)
export function mulberry32(seed: number): Rng;
export const defaultRng: Rng;              // Math.random
// constants.ts
export const CYCLE: Category[]; MAX_ROUNDS=12; MAX_FOCUS=5; SPECIAL_COST=3; COUNTER_MULT=1.5; COUNTER_INTERRUPT=0.5; GUARD_REDUCTION=0.6; DMG_K=8; DEF_K=2; HP_K=1; ROLE_BONUS=1.1; INSIGHT_BONUS=1.25; FEINT_MIN=0.05; FEINT_MAX=0.25; FEINT_SOCIAL_K=120; AI_SPECIAL_CHANCE=0.6;
export const SPECIALS: Record<RoleCategory, { name: string; category: Category; mult: number }>;
```
`src/lib/types.ts`: `BattleRound` gains optional `playerAction?, actionCategory?, opponentIntent?, opponentAction?, countered?, feint?, special?` (strings/booleans); `BattleLog` gains `tactical?: boolean; manualActions?: number;`. `battle-engine.ts`: `export function calculateGrowth`.

- [ ] Step 1: test `mulberry32(42)` yields the same 5-number sequence twice, all in [0,1).
- [ ] Step 2: `pnpm vitest run src/lib/tactical/__tests__/rng.test.ts` → FAIL (module missing).
- [ ] Step 3: implement:
```ts
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
```
- [ ] Step 4: test passes; `pnpm exec tsc --noEmit` clean.
- [ ] Step 5: commit `feat(tactical): add engine types, constants, seeded rng`.

### Task 2: Engine

**Files:** Create `src/lib/tactical/engine.ts`; Test `src/lib/tactical/__tests__/engine.test.ts`

**Interfaces — Produces:**
```ts
export function beats(a: Category, b: Category): boolean;
export function counterFor(c: Category): Category;          // the category that beats c
export function feintChance(side: SideState): number;
export function toSide(agent: AgentWithDimensions): SideState;
export function createBattle(attacker: AgentWithDimensions, defender: AgentWithDimensions, mode: BattleMode, rng: Rng): TacticalState;
export function chooseIntent(side: SideState, rng: Rng): Intent;
export function resolveRound(state: TacticalState, action: PlayerAction, rng: Rng, opts: { manual: boolean }): TacticalState; // returns new state, never mutates
export function aiAction(state: TacticalState): PlayerAction;
export function strongestCategory(side: SideState): Category;
// Lower-level single exchange reused by squads (plan 2) and raids (plan 3). resolveRound = resolveExchange + focus/finish/next-intent bookkeeping.
export interface ExchangeMods {
  outgoingMult?: { attacker?: (c: Category) => number; defender?: (c: Category) => number }; // synergy, weakness/resist, enrage
  incomingMultAttacker?: number;   // e.g. 0.5 for an agent swapping in
  counterMult?: number;            // default COUNTER_MULT (raid phase 3: 1.75)
  defenderStunImmune?: boolean;    // boss: Shield Bash gets ×1.5 instead of stunning
  defenderNoFeint?: boolean;       // boss never feints
  attackerSkipsAction?: boolean;   // swap without tag: attacker deals nothing this exchange
}
export interface ExchangeResult { attacker: SideState; defender: SideState; attackerDamage: number; defenderDamage: number; countered: boolean; feint: boolean; attackerFirst: boolean; playerAction: TacticalRound["playerAction"]; actionCategory?: Category; opponentAction: string; special?: string; }
export function resolveExchange(attacker: SideState, defender: SideState, intent: Intent, action: PlayerAction, rng: Rng, mods?: ExchangeMods): ExchangeResult; // pure; applies HP, focus spend, stun/insight; does NOT add end-of-round focus
export function endOfRoundFocus(side: SideState, gained: { guard: boolean; counter: boolean }): SideState;
export function masteryMultiplier(state: { manualActions: number; counters: number }): number;
export function runAuto(state: TacticalState, rng: Rng): TacticalState;
export function toBattleLog(state: TacticalState, id?: string): BattleLog; // growth + mastery
```
Rules (exact): `strikeDamage(src,dst,C,rng,mult=1,ignoreDef=false) = max(round(src.catAvg[C]*(0.85+0.3*rng())*DMG_K*(roleCat(src.role)===C?ROLE_BONUS:1)*mult - (ignoreDef?0:dst.catAvg[C]*DEF_K)), 5)`. Round order: (1) throw `InvalidActionError` for special with focus<3 (unless attacker stunned); (2) defender action from intent (stunned→none; special without focus→strike strongest; strike→feint roll picks another category uniformly); (3) attacker damage (stunned→0; strike: ×1.5 if countered, ×1.25 if insight; special per SPECIALS, spend 3 focus, shield bash stuns defender, insight sets insightRounds=2 after decrement); (4) defender damage (strike ×0.5 if countered, ×(1−0.6) if guard, ×1.25 if defender insight; defender special same table incl. stunning attacker, spends 3 focus; `ultimate` intent = strike in its category ×3, or ×1×0.4 if attacker guarded); (5) initiative `speed + rng()*5`, ties → attacker; first hit KO cancels second; (6) focus: +1 each, +1 guard, +1 counter, cap 5; (7) finish check / winner; (8) next intent.
AI policy order: intent special & hp<50% → guard; focus≥3 → special; intent strike → strike `counterFor(intent.category)`; else strike strongest.

- [ ] Step 1: write tests: `beats`/`counterFor` for all 5; counter applies ×1.5 and +1 focus (rng stub `() => 0.5`, compare with non-counter); guard reduces defender damage by 60%; special throws `InvalidActionError` with focus 2; Shield Bash sets next intent `{kind:"stunned"}` and defender deals 0 next round; stunned attacker deals 0 regardless of action; Overclock ignores defense; Insight gives `insightRounds===2` and 0 feints over 200 trials; feintChance clamps (social 0→0.05, 10000→0.25); 12-round cap with tie → defender; `resolveRound` does not mutate input (deep-equal snapshot); `toBattleLog` mastery: manual + 3 counters → each attacker growth value is 1.3× base (stub by comparing with same-rng auto run is brittle → instead assert `masteryMultiplier(state)` helper: export `masteryMultiplier(state): number`).
- [ ] Step 2: run → FAIL.
- [ ] Step 3: implement engine (see rules).
- [ ] Step 4: run → PASS.
- [ ] Step 5: commit `feat(tactical): pure battle engine with counters, guard, specials`.

### Task 3: Balance simulation

**Files:** Test `src/lib/tactical/__tests__/balance.test.ts`; maybe modify `constants.ts`.
Agents built with `makeAgent(role, valuePerDim)` (50 dims). 2,000 seeded fights each:
- equal (value 150, both `medieval`/`future` mixes): AI vs AI via `runAuto` → median rounds in [6,10], attacker win rate in [0.45,0.55] (defender also uses intents; attacker uses `aiAction`).
- skilled: attacker uses `aiAction` (it is the counter policy) vs **naive** baseline: compare `runAuto` against a "random-action" attacker; assert counter policy win rate in [0.65,0.80] vs equal stats, random-action attacker ≤ 0.45.
- +20% stats random-action attacker vs AI defender? Spec: stronger side wins ≥55% vs optimal underdog → attacker value 150 optimal vs defender 180 → defender wins ≥ 0.55.
Tuning rule: if median rounds is outside range scale `HP_K` by `8 / median`; if skilled win rate > 0.80 lower `COUNTER_MULT` by 0.1; < 0.65 raise by 0.1. Re-run until green. Record final constants.
- [ ] Steps: write test → run → tune constants → PASS → commit `test(tactical): balance simulations; tune constants`.

### Task 4: Session store + admin client + migration

**Files:** Create `src/lib/supabase-admin.ts`, `src/lib/tactical/session-store.ts`, `supabase/migrations/003_tactical_battles.sql`; Test `src/lib/tactical/__tests__/session-store.test.ts`

**Interfaces — Produces:**
```ts
export function getAdminSupabase(): SupabaseClient | null; // null if URL or SUPABASE_SERVICE_ROLE_KEY missing
export type SessionMode = BattleMode | "squad_pvp" | "raid";
export interface BattleSession<S = unknown> { id: string; mode: SessionMode; playerId: string; attackerId: string | null; defenderId: string | null; state: S; status: "active" | "finished"; createdAt: string; }
export interface SessionStore {
  create<S>(s: { mode: SessionMode; playerId: string; attackerId: string | null; defenderId: string | null; state: S }): Promise<BattleSession<S>>;
  get<S>(id: string): Promise<BattleSession<S> | null>;
  findActive<S>(filter: { agentId?: string; playerId?: string; mode?: SessionMode }): Promise<BattleSession<S>[]>;
  updateState<S>(id: string, expectedRound: number, state: S): Promise<boolean>;  // optimistic on state.round
  markFinished(id: string, battleLogId: string | null): Promise<void>;
  countActiveToday(filter: { agentId?: string; playerId?: string; mode: SessionMode }): Promise<number>;
}
export class MemorySessionStore implements SessionStore {}
export class SupabaseSessionStore implements SessionStore { constructor(sb: SupabaseClient) }
export function getSessionStore(): SessionStore; // admin → Supabase; no Supabase at all → memory singleton; anon-only → throws Error("SUPABASE_SERVICE_ROLE_KEY is not configured")
```
`agentId` filter matches attacker_id OR defender_id. State must contain numeric `round`.
Migration: as in spec, plus `mode` check includes `'training','pvp','squad_pvp','raid'` up front (avoids an ALTER in later plans), `attacker_id` nullable (raids/squads use player-level sessions), and `player_id` index for active sessions.
- [ ] Steps: tests for MemorySessionStore (create/get, updateState rejects wrong round, findActive by agent matches defender too, countActiveToday ignores finished) → FAIL → implement → PASS → commit `feat(tactical): session store, admin client, migration 003`.

### Task 5: Battle service + db helpers

**Files:** Create `src/lib/tactical/battle-service.ts`; Modify `src/lib/db.ts`; Test `src/lib/tactical/__tests__/battle-service.test.ts`

**db.ts additions (both Supabase and demo branches):**
```ts
export async function getPlayerByWallet(wallet: string): Promise<Player | null>;
export async function getRandomOpponentAgentId(excludePlayerId: string, rng: () => number = Math.random): Promise<string | null>;
```
`saveBattleLog` / `savePvpBattleLog`: when `log.tactical` add `tactical: true, manual_actions: log.manualActions ?? 0` to the insert.

**Service interfaces — Produces:**
```ts
export type ServiceResult = { status: number; body: Record<string, unknown> };
export interface ServiceDeps { store: SessionStore; rng: Rng }
export const MAX_TRAINING_FIGHTS = 3, MAX_PVP_FIGHTS = 3;
export function parseAction(raw: unknown): Action | null;
export async function startBattle(input: { mode?: string; agentId?: string; walletAddress?: string; opponentAgentId?: string }, deps: ServiceDeps): Promise<ServiceResult>;
export async function takeTurn(input: { sessionId?: string; walletAddress?: string; round?: number; action?: unknown }, deps: ServiceDeps): Promise<ServiceResult>;
export async function getSessionView(input: { sessionId: string; walletAddress: string }, deps: ServiceDeps): Promise<ServiceResult>;
export async function finalizeSession(session: BattleSession<TacticalState>, deps: ServiceDeps): Promise<BattleLog>; // auto-completes unfinished state, saves log (+pvp stats), marks finished
export async function resolveStaleSessions(agentId: string, deps: ServiceDeps): Promise<void>;
```
Error bodies `{ error: code }`: `missing_fields` 400, `invalid_mode` 400, `invalid_action` 400, `not_owner` 403, `no_session` 404, `stale_round` 409, `no_opponent` 409, `session_finished` 410, `fight_limit_reached` 429, `internal` 500.
Turn flow: validate → load → ownership → finished→410 → round mismatch→409 → resolve (auto→`runAuto`) → `updateState(id, round, next)` false→409 → if finished `finalizeSession` → `{ rounds: next.rounds.slice(round), state: next, finished, battleLog? }`.
- [ ] Step 1: tests (demo db + MemorySessionStore + `mulberry32(1)`): seed a player with 2 agents via `getOrCreatePlayer` + `summonAgent` + `generateInitialDimensions` and another player with 1 agent. Cases: training start OK; not owner 403; opponent not owned 403; 4th training start → 429 (3 starts while active count); stale session auto-resolved on new start (log count +1 via `getBattleLogs`); turn with wrong round 409; special with focus 0 → 400; auto finishes and returns battleLog with `tactical: true`; finished session turn → 410; pvp start picks other player's agent; duplicate concurrent turns (Promise.all same round) → exactly one 200.
- [ ] Step 2: FAIL → Step 3: implement → Step 4: PASS → Step 5: commit `feat(tactical): battle service with sessions, limits, finalisation`.

### Task 6: Route handlers (replace old PvP route)

**Files:** Create `src/app/api/battle/start/route.ts`, `src/app/api/battle/turn/route.ts`, `src/app/api/battle/session/[id]/route.ts`; Delete `src/app/api/pvp/battle/route.ts`.
```ts
// start/route.ts
import { NextRequest, NextResponse } from "next/server";
import { startBattle } from "@/lib/tactical/battle-service";
import { getSessionStore } from "@/lib/tactical/session-store";
import { defaultRng } from "@/lib/tactical/rng";
export async function POST(req: NextRequest) {
  let body: unknown; try { body = await req.json(); } catch { return NextResponse.json({ error: "missing_fields" }, { status: 400 }); }
  try { const r = await startBattle(body as never, { store: getSessionStore(), rng: defaultRng }); return NextResponse.json(r.body, { status: r.status }); }
  catch (e) { console.error("[battle/start]", e); return NextResponse.json({ error: "internal" }, { status: 500 }); }
}
```
turn: same with `takeTurn`, log tag `[battle/turn]`. session GET: `req.nextUrl.searchParams.get("wallet")`, `params: Promise<{ id: string }>` (Next 16 async params).
- [ ] Steps: implement → `pnpm exec tsc --noEmit` → `pnpm build` compiles routes → commit `feat(tactical): battle API routes; remove legacy pvp route`.

### Task 7: CounterWheel + TacticalBattle component

**Files:** Create `src/components/CounterWheel.tsx`, `src/components/TacticalBattle.tsx`; Test `src/components/__tests__/TacticalBattle.test.tsx`
**Props:**
```ts
export function CounterWheel(props: { highlight?: Category | null; size?: number }): JSX.Element;
export interface TacticalBattleProps { sessionId: string; initialState: TacticalState; attacker: AgentWithDimensions; defender: AgentWithDimensions; walletAddress: string; onFinished: (log: BattleLog) => void; }
```
Behaviour: header HP bars + focus pips (5); intent banner (`⚠ {name} is charging {CAT}` / `SPECIAL` / `is stunned`) with counter hint shown only after tutorial seen (`localStorage["tactical_tutorial_seen"]`, wrapped in try/catch); 5 strike buttons + Guard + Special (disabled focus<3, label `✦ {SPECIALS[role].name}`) + Auto; when attacker stunned show only `Continue (stunned)` which posts `{type:"guard"}`; buttons disabled while request in flight; POST `/api/battle/turn` with `{sessionId, walletAddress, round: state.round, action}`; on 409 refetch `GET /api/battle/session/{id}?wallet=`; round log (latest first) with `COUNTER!` badge, feint note; damage floaters + shake class for ≤900ms; Auto plays returned rounds sequentially at 300ms each with Skip; on `finished` call `onFinished(battleLog)`. Tutorial overlay 3 steps on first mount.
- [ ] Step 1: tests (mock `global.fetch`, preset localStorage seen): renders intent text; clicking `Mental` posts body with `action:{type:"strike",category:"Mental"}` and `round:0`; Special disabled at focus 0; stunned state renders Continue only; finished response calls `onFinished`.
- [ ] Step 2 FAIL → 3 implement → 4 PASS → 5 commit `feat(tactical): TacticalBattle UI and counter wheel`.

### Task 8: Battle page integration

**Files:** Modify `src/app/battle/page.tsx`.
- Remove `resolveBattle`, `saveBattleLog`, `BattlePlayback` usage in live fights; keep imports used elsewhere.
- `startBattle()` → POST `/api/battle/start` `{mode:"training", agentId: selected[0], opponentAgentId: selected[1], walletAddress}`; store `{sessionId, state, attacker, defender}` in `tactical` state; phase `"battle"` renders `<TacticalBattle …onFinished={(log)=>{setBattleLog(log); setPlaybackDone(true); refreshAgents();}}/>` then existing growth/result UI plus mastery line `Counters: N → +X% growth` when `log.manualActions`.
- `startPvpBattle()` → POST `/api/battle/start` `{mode:"pvp", agentId, walletAddress}`; same error mapping as before (429/409/other); render TacticalBattle in PvP phase; on finish refresh stats.
- Error messages for training start (429 → "One of these agents has no fights left today.").
- [ ] Steps: implement → `pnpm exec tsc --noEmit` → `pnpm lint` (no new errors in touched files) → manual run `pnpm dev` demo mode: training fight manual + auto → commit `feat(battle): use tactical battles for training and PvP`.

### Task 9: Docs + env

- Add `SUPABASE_SERVICE_ROLE_KEY=` to `.env.local.example`; CLAUDE.md "Tactical Battles" section: migration 003 must be applied in Supabase SQL editor before deploy; service key in Vercel (production+preview, sensitive).
- Guide page (`src/app/guide/page.tsx`): add a short "Tactical Battles" section (cycle, guard, specials).
- [ ] Commit `docs: tactical battles setup and guide`.
