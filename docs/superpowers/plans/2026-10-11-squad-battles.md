# Squad Battles 3v3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let players save a 3-agent squad and fight rating-matched async squad PvP using the tactical engine, with Swap / Tag Special and role synergies.

**Architecture:** A pure team layer (`src/lib/tactical/squad.ts`) composes the single-agent `resolveExchange` from the tactical engine. Squad persistence, matchmaking and Elo live in `src/lib/squads.ts`. `battle-service` gains the `squad_pvp` mode (player-level sessions in the same `levelup_battle_sessions` table). UI: `/squad` builder, a `SquadBattle` component, and a Squads tab on the Rank page.

**Tech Stack:** Same as Tactical Battles (Next.js 16, React 19, TS, Supabase, Vitest).

**Spec:** `docs/superpowers/specs/2026-10-11-squad-battles-design.md` (depends on `docs/superpowers/plans/2026-10-11-tactical-battles.md` being complete)

## Global Constraints

- Slots: Lead / Second / Anchor (indexes 0/1/2). Exactly 3 distinct agents owned by the player.
- Synergy: 3 distinct roles = Trinity +10% all; 2 same + 1 = Pair +15% on the pair role's category for pair members; 3 same = Legion +25% role category, −10% others.
- Swap uses the turn; incoming agent takes 50% damage that round. Tag Special if team Focus ≥ 3 at swap: incoming fires its Special (spends 3).
- Shared team Focus (max 5). KO → next living member in slot order.
- 24-round cap; tie → higher total HP% wins, exact tie → defender.
- Per-agent HP = `sum(dims) × HP_K × SQUAD_HP_FACTOR` (start 0.45; tuned so median rounds 12–18).
- 2 squad battles per player per UTC day. Growth per participating agent ×0.6, then mastery on attacker team.
- Elo start 1000, K = 32. Matchmaking ±150 rating, widen by 150 until found; avoid last 3 opponents when possible.
- AI swap rule: active HP < 25% and a benched living ally's strongest category counters the opponent's last-used category → swap (≤ once per 3 rounds); Focus ≥ 3 → Special in place.

## Review Focus

- Player deletes/loses an agent that was in their saved squad → auto-squad used, no crash (Task 3 test).
- Swap to a KO'd or already-active slot → 400 `invalid_swap` (Task 4 test).
- Player with < 3 agents opens Squad Battle → 409 `no_squad` + Summon CTA (Task 4 test, Task 6).
- Only one other player exists and they were the last opponent → still matched (repeat-exclusion is best-effort) (Task 3 test).
- Final KO and 24-round cap in the same round → KO wins, no tie-break (Task 1 test).

---

### Task 1: Squad engine

**Files:** Create `src/lib/tactical/squad.ts`; Modify `src/lib/tactical/types.ts` (add `swap?`, `ko?`, `actorSlot?` to `TacticalRound`), `src/lib/tactical/constants.ts` (`SQUAD_HP_FACTOR = 0.45`, `SQUAD_MAX_ROUNDS = 24`, `SQUAD_GROWTH_FACTOR = 0.6`, `SWAP_INCOMING_MULT = 0.5`, `SYNERGY` table); Test `src/lib/tactical/__tests__/squad.test.ts`

**Interfaces — Consumes:** `resolveExchange`, `endOfRoundFocus`, `chooseIntent`, `strongestCategory`, `counterFor`, `toSide`, `SPECIALS`, `Rng`.
**Produces:**
```ts
export type SynergyName = "trinity" | "pair" | "legion";
export interface Synergy { name: SynergyName; role?: RoleCategory; }
export interface TeamState { playerId: string; members: SideState[]; active: number; focus: number; synergy: Synergy; lastSwapRound: number; participated: boolean[]; }
export type SquadAction = PlayerAction | { type: "swap"; slot: number };
export type SquadMode = "squad_pvp" | "raid";
export interface SquadState { mode: SquadMode; round: number; maxRounds: number; teams: Record<SideKey, TeamState>; intent: Intent; lastAttackerCategory: Category | null; manualActions: number; counters: number; rounds: TacticalRound[]; finished: boolean; winner: SideKey | null; damageDealt: number; }
export function synergyFor(roles: RoleCategory[]): Synergy;
export function synergyMult(team: TeamState, memberIndex: number, c: Category): number;
export function buildTeam(playerId: string, agents: AgentWithDimensions[], hpFactor?: number): TeamState;
export function createSquadBattle(a: { playerId: string; agents: AgentWithDimensions[] }, d: { playerId: string; agents: AgentWithDimensions[] }, rng: Rng): SquadState;
export function resolveSquadRound(state: SquadState, action: SquadAction, rng: Rng, opts: { manual: boolean; mods?: (state: SquadState) => ExchangeMods; nextIntent?: (state: SquadState, rng: Rng) => Intent }): SquadState; // throws InvalidActionError
export function squadAiAction(state: SquadState): SquadAction;
export function runSquadAuto(state: SquadState, rng: Rng, opts?: { mods?: …; nextIntent?: … }): SquadState;
export function squadGrowth(state: SquadState): Record<SideKey, Record<string, Record<number, number>>>; // agentId → growth, only participated members, ×0.6, attacker × masteryMultiplier
```
Round algorithm: (1) validate (swap target alive & ≠ active, special focus); (2) copy team focus into active sides; (3) if swap: set `active`, `lastSwapRound`, call `resolveExchange` with `incomingMultAttacker: 0.5` and action = Special if focus ≥ 3 (tag; round `swap.tag = true`) else `attackerSkipsAction: true`; else normal exchange; outgoing mults from `synergyMult` merged (multiplied) with `opts.mods`; (4) write sides back, team focus = side focus after `endOfRoundFocus`; (5) KO handling: if active hp ≤ 0 → next living index, round `ko`; enemy team (defender) intent-side KO same; (6) mark `participated`; (7) finish when a team has no living member or `round ≥ maxRounds` (KO check first); (8) `damageDealt += attackerDamage`; (9) next intent from `opts.nextIntent ?? chooseIntent(defender active)`; stunned → `{kind:"stunned"}`.
- [ ] Step 1: tests: synergyFor for all 3; KO advances to next slot; swap halves incoming damage (compare with same rng no-swap guard-free baseline); tag special spends 3 focus and sets `swap.tag`; invalid swap targets throw; shared focus capped 5; KO on round 24 → KO winner; `squadGrowth` excludes non-participants.
- [ ] Step 2 FAIL → 3 implement → 4 PASS → 5 commit `feat(squad): team engine with swap, tag special, synergy`.

### Task 2: Squad balance

**Files:** Test `src/lib/tactical/__tests__/squad-balance.test.ts`; maybe tune `SQUAD_HP_FACTOR`.
- 1,000 seeded fights, equal 150-value agents, both AI (`runSquadAuto`): median rounds in [12,18]; tuning rule `SQUAD_HP_FACTOR *= 15 / median`.
- Trinity (medieval, future, modern) vs Legion (3× medieval) equal totals: Trinity win rate in [0.40, 0.60].
- [ ] Steps: test → tune → PASS → commit `test(squad): balance simulations`.

### Task 3: Squad persistence, matchmaking, Elo, migration

**Files:** Create `supabase/migrations/004_squads.sql` (tables `levelup_squads`, `levelup_squad_stats`, `levelup_squad_battles` + index, RLS select-all + no anon writes, function `levelup_squad_apply_result(p_winner uuid, p_loser uuid, p_delta int)` upserting W/L and ±rating), `src/lib/squads.ts`; Modify `src/lib/db.ts` (export `applyAgentGrowth`); Test `src/lib/__tests__/squads.test.ts`

**Produces:**
```ts
// db.ts
export async function applyAgentGrowth(agentId: string, growth: Record<number, number>): Promise<void>; // Supabase: levelup_increment_dimension per dim; demo: mutate localDimensions
// squads.ts (writes use getAdminSupabase() ?? demo memory; reads use getSupabase() ?? memory)
export interface SquadStats { playerId: string; wins: number; losses: number; rating: number; }
export async function getSquad(playerId: string): Promise<string[] | null>;            // null if missing or any agent no longer owned
export async function saveSquad(playerId: string, agentIds: string[]): Promise<void>;   // throws Error("invalid_squad") if not 3 distinct owned
export async function getOrBuildSquad(playerId: string): Promise<AgentWithDimensions[] | null>; // saved, else top-3 by dim sum, null if < 3 agents
export async function getSquadStats(playerIds: string[]): Promise<Record<string, SquadStats>>; // default rating 1000
export async function getSquadLeaderboard(limit?: number): Promise<(SquadStats & { agentIds: string[] })[]>;
export async function findSquadOpponent(playerId: string, rating: number, rng: Rng): Promise<string | null>; // player id
export async function getRecentSquadOpponents(playerId: string, n: number): Promise<string[]>;
export async function countSquadBattlesToday(playerId: string): Promise<number>;
export function eloDelta(winnerRating: number, loserRating: number): number; // round(32 * (1 - 1/(1+10^((Rl-Rw)/400)))), min 1
export async function recordSquadBattle(input: { attackerPlayerId: string; defenderPlayerId: string; winnerPlayerId: string; attackerSquad: string[]; defenderSquad: string[]; rounds: unknown[]; manualActions: number }): Promise<{ ratingDelta: number }>;
```
Opponent pool: players with saved squad ∪ players with ≥ 3 agents; exclude self; band ±150 widening by 150 to 2000; among band exclude last 3 opponents unless that empties it.
- [ ] Step 1: tests (demo mode): save/get roundtrip; saveSquad rejects 2 agents / foreign agent; getOrBuildSquad falls back to top 3 when saved squad references a missing agent; eloDelta(1000,1000) = 16; findSquadOpponent with single other player who was last opponent still returns them; countSquadBattlesToday increments after recordSquadBattle.
- [ ] Step 2 FAIL → 3 implement → 4 PASS → 5 commit `feat(squad): persistence, matchmaking, elo, migration 004`.

### Task 4: Service + routes for squad_pvp

**Files:** Modify `src/lib/tactical/battle-service.ts`; Create `src/app/api/squad/route.ts` (GET `?wallet=` → `{ squad, stats, synergy }`, PUT `{walletAddress, agentIds}`); Test `src/lib/tactical/__tests__/squad-service.test.ts`
- `startBattle` accepts `mode: "squad_pvp"` (no agentId): player by wallet → `getOrBuildSquad` (null → 409 `no_squad`) → limit `countSquadBattlesToday + store.countActiveToday({playerId, mode})` ≥ `MAX_SQUAD_BATTLES = 2` → 429 `squad_limit_reached` → resolve stale active squad sessions for player → opponent via `findSquadOpponent` (null → 409 `no_opponent`) → `createSquadBattle` → store session (`attackerId/defenderId` null) → 200 `{ sessionId, state, attackers, defenders }`.
- `takeTurn` dispatches on `session.mode`: squad modes use `parseSquadAction` (adds `{type:"swap", slot}`), `resolveSquadRound` / `runSquadAuto`, `InvalidActionError` → 400 `invalid_swap` for swap, `invalid_action` otherwise.
- `finalizeSession` squad branch: `squadGrowth` → `applyAgentGrowth` per agent → `recordSquadBattle` → markFinished; response adds `growth` and `ratingDelta`.
- [ ] Step 1: tests: start 409 for player with 2 agents; 3rd start → 429; swap to KO'd slot → 400 invalid_swap; auto finish records battle and changes both ratings by equal and opposite delta; PUT squad with foreign agent → 400.
- [ ] Step 2 FAIL → 3 implement → 4 PASS → 5 commit `feat(squad): squad_pvp service mode and squad API`.

### Task 5: SquadBattle component

**Files:** Create `src/components/SquadBattle.tsx`, extract shared pieces from `TacticalBattle.tsx` into `src/components/tactical/{HpBar,IntentBanner,ActionGrid,RoundLog}.tsx` (TacticalBattle re-uses them; its tests must stay green); Test `src/components/__tests__/SquadBattle.test.tsx`
Props: `{ sessionId; initialState: SquadState; attackers: AgentWithDimensions[]; defenders: AgentWithDimensions[]; walletAddress; onFinished(result: { winner: SideKey; growth; ratingDelta }) }`. Bench strip with 3 mini HP bars per team (KO'd greyed), synergy badge, Swap menu listing living benched allies (label `⇄ Tag!` when focus ≥ 3), turn POST same as tactical.
- [ ] Step 1 tests: swap menu hides KO'd/active members; clicking a bench member posts `{type:"swap", slot}`; synergy badge text "Trinity +10%".
- [ ] Step 2 FAIL → 3 implement → 4 PASS → 5 commit `feat(squad): SquadBattle UI`.

### Task 6: Squad builder page, battle tab, rank tab

**Files:** Create `src/app/squad/page.tsx`; Modify `src/app/battle/page.tsx` (top tabs `Duel | Squad`; Squad tab shows saved squad + "Squad Battle ⚔ (n/2 today)" + link to `/squad`; renders `SquadBattle`), `src/app/rank/page.tsx` (tab "Squads" from `getSquadLeaderboard`).
- Builder: agent grid (tap to fill next empty slot, tap slot to clear), live synergy via `synergyFor`, Save → PUT `/api/squad`; < 3 agents → message + `/summon` link.
- [ ] Steps: implement → `pnpm exec tsc --noEmit` → manual demo run (save squad, fight auto + manual) → commit `feat(squad): builder page, battle tab, rank tab`.
