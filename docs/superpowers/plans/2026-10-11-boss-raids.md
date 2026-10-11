# Weekly Boss Raids Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A weekly shared world boss that every player attacks with their squad in 10-round tactical attempts; global HP, live feed, contribution leaderboard, tiered rewards and trophies.

**Architecture:** Boss roster + a raid layer over the squad engine (`src/lib/raid/raid-engine.ts`) supplies per-round `ExchangeMods` (weakness/resist, enrage, counter ×1.75) and boss intents (ULTIMATE cadence by phase). `raid-db.ts` wraps an atomic damage RPC, payouts and reads. `battle-service` gains `mode: "raid"`. A weekly Vercel cron closes/pays/spawns. `/raid` page shows the boss stage with Supabase Realtime + polling fallback.

**Tech Stack:** Same as previous plans; Supabase Realtime (`supabase.channel().on("postgres_changes", …)`).

**Spec:** `docs/superpowers/specs/2026-10-11-boss-raids-design.md` (depends on Tactical + Squad plans)

## Global Constraints

- 3 raid attempts per player per UTC day. Attempt = ≤ 10 rounds or squad wipe; boss never dies inside the attempt engine (its in-attempt HP is the current global HP, clamped ≥ 1 for the engine; damage is applied globally at finalise).
- Players with < 3 agents attack solo with their best agent; all their damage ×1.5.
- Phases by global HP%: P1 100–66 (weak ×1.5, resist ×0.5), P2 66–33 (weakness rotates to P2 weak; ULTIMATE every 4th round), P3 < 33 (boss dmg +30%, ULTIMATE every 3rd round, counter ×1.75).
- ULTIMATE: unguarded active agent takes 3×; guarded ×1 then −60%.
- Boss never feints; never stunned (Shield Bash ×1.5 instead).
- Boss stats: `catAvg_boss(C) = p75(active agents' catAvg(C)) × profile[C]`; speed = p75 speed.
- Weekly cron Monday 00:00 UTC (`0 0 * * 1`), Bearer `CRON_SECRET`, idempotent on `week_start`.
- HP: `clamp(lastWeekTotalDamage × m, MIN_HP=200_000, MAX_HP=50_000_000)`, `m = 1.1` if last boss expired, else `min(1.1 × 5 / max(dayKilled,1), 1.6)` where dayKilled = days from week_start (1-based); first ever boss: `14 × 3 × 5 × MEDIAN_ATTEMPT_DAMAGE` (from simulation in Task 1, stored as constant).
- Rewards per tier (Champion #1: +300 ability, +3.0 per weakness-category dim per squad agent; Elite #2–3: +150, +2.0; Vanguard top 10: +75, +1.0; Participant: +30, +0.5; Last Hit: +100 + slayer trophy). Expired → 50% (ability rounded down, growth halved), no slayer.
- Attempt growth: normal squad growth ×0.6 (already in `squadGrowth`).
- Payout exactly once (`paid_out_at IS NULL` guard).
- Nav: replace Guide with Raid (🐉); Guide link moves to dashboard.

## Review Focus

- Two players finish attempts simultaneously crossing 0 HP → exactly one `killed`, exactly one Last Hit (Task 2 test).
- No active boss (cron failed / between weeks) → `/raid` shows "Next boss arrives soon", attack 409 `no_active_boss` (Task 3 test, Task 5).
- Attempt finishes after another player killed the boss → contribution recorded, `killed:false`, rewards still include them if payout hasn't run (Task 2 test).
- Realtime channel errors (Realtime not enabled) → polling every 15s keeps HP updating (Task 5 manual + unit on hook fallback).
- Cron re-run in the same week → no second boss, no double payout (Task 4 test).

---

### Task 1: Boss roster + raid engine

**Files:** Create `src/lib/raid/bosses.ts`, `src/lib/raid/raid-engine.ts`; Test `src/lib/raid/__tests__/raid-engine.test.ts`
**Consumes:** `buildTeam`, `resolveSquadRound`, `runSquadAuto`, `squadAiAction`, `SquadState`, `ExchangeMods`, `SideState`, `Rng`.
**Produces:**
```ts
// bosses.ts
export interface BossDef { key: string; name: string; lore: string; profile: Record<Category, number>; weak: Category; p2Weak: Category; resist: Category; spriteSeed: Record<string, number>; role: RoleCategory; }
export const BOSSES: BossDef[];            // 5 entries from the spec table, in rotation order
export function bossForWeek(index: number): BossDef; // BOSSES[index % 5]
export interface BossStats { catAvg: Record<Category, number>; speed: number; }
export function computeBossStats(agents: AgentWithDimensions[], def: BossDef): BossStats; // p75 × profile; empty list → 150 × profile
// raid-engine.ts
export const RAID_MAX_ROUNDS = 10, SOLO_DAMAGE_MULT = 1.5;
export const MEDIAN_ATTEMPT_DAMAGE: number;  // filled from simulation in this task
export type RaidPhase = 1 | 2 | 3;
export function phaseFor(hpRemaining: number, maxHp: number): RaidPhase;
export function currentWeakness(def: BossDef, phase: RaidPhase): Category;
export interface RaidContext { def: BossDef; stats: BossStats; maxHp: number; hpAtStart: number; solo: boolean; }
export interface RaidState extends SquadState { raid: RaidContext; }
export function createRaidAttempt(player: { playerId: string; agents: AgentWithDimensions[] }, ctx: RaidContext, rng: Rng): RaidState;
export function raidMods(state: RaidState): ExchangeMods;
export function raidIntent(state: RaidState, rng: Rng): Intent;   // ULTIMATE cadence, else strike weighted catAvg²
export function resolveRaidRound(state: RaidState, action: SquadAction, rng: Rng, opts: { manual: boolean }): RaidState;
export function runRaidAuto(state: RaidState, rng: Rng): RaidState;
export function attemptDamage(state: RaidState): number;           // state.damageDealt (solo mult already applied in mods)
```
Boss team = 1 member built from stats (`hp = max(hpAtStart,1) × 10` so it can't be KO'd in 10 rounds; damage dealt is tracked via `damageDealt`, not boss HP). Phase is computed from `hpAtStart - damageDealt`. `maxRounds = 10`; finished when attacker team wiped or round 10.
- [ ] Step 1 tests: `phaseFor` boundaries (66%/33%); P1 weakness ×1.5 vs neutral damage ratio; resist ×0.5; ULTIMATE intent on rounds 4,8 in P2 and 3,6,9 in P3, none in P1; unguarded ULTIMATE = 3× regular; guarded ULTIMATE less than regular; Shield Bash on boss never yields stunned intent; boss never feints (1,000 rounds); solo attempt damage = 1.5× same-seed team-of-1 without solo flag; 10-round cap; simulation prints median attempt damage for 150-value squad vs 150-stat boss → set `MEDIAN_ATTEMPT_DAMAGE`.
- [ ] Step 2 FAIL → 3 implement → 4 PASS → 5 commit `feat(raid): boss roster and raid engine`.

### Task 2: Raid persistence + migration

**Files:** Create `supabase/migrations/005_raids.sql` (tables `levelup_raid_bosses`, `levelup_raid_contributions`, `levelup_raid_hits` (+ `agent_name text`, `player_label text` for feed), `levelup_player_trophies`; RLS select-all; functions `levelup_raid_apply_damage(p_boss uuid, p_player uuid, p_damage bigint, p_best int, p_counters int, p_label text) RETURNS TABLE(hp_remaining bigint, killed boolean)` and `levelup_raid_claim_payout(p_boss uuid) RETURNS boolean`; `ALTER PUBLICATION supabase_realtime ADD TABLE levelup_raid_bosses, levelup_raid_hits;`), `src/lib/raid/raid-db.ts`; Test `src/lib/raid/__tests__/raid-db.test.ts`
**Produces:**
```ts
export interface RaidBoss { id: string; bossKey: string; weekStart: string; stats: BossStats; maxHp: number; hpRemaining: number; status: "active"|"defeated"|"expired"; lastHitPlayerId: string | null; defeatedAt: string | null; paidOutAt: string | null; createdAt: string; }
export interface RaidContribution { bossId: string; playerId: string; damage: number; attempts: number; bestHit: number; }
export interface RaidHit { id: string; bossId: string; playerId: string; damage: number; counters: number; label: string; createdAt: string; }
export type RewardTier = "champion" | "elite" | "vanguard" | "participant";
export const REWARDS: Record<RewardTier, { ability: number; growthPerDim: number }>; export const LAST_HIT_ABILITY = 100;
export async function getActiveBoss(): Promise<RaidBoss | null>;
export async function getBossByWeek(weekStart: string): Promise<RaidBoss | null>;
export async function getLatestBoss(): Promise<RaidBoss | null>;
export async function createBoss(input: { bossKey: string; weekStart: string; stats: BossStats; maxHp: number }): Promise<RaidBoss>; // unique week_start → returns existing on conflict
export async function setBossStatus(id: string, status: "expired"): Promise<void>;
export async function applyRaidDamage(input: { bossId: string; playerId: string; damage: number; bestHit: number; counters: number; label: string }): Promise<{ hpRemaining: number; killed: boolean }>;
export async function getContributions(bossId: string): Promise<RaidContribution[]>; // sorted damage desc
export async function getRecentHits(bossId: string, n: number): Promise<RaidHit[]>;
export async function countRaidAttemptsToday(playerId: string): Promise<number>;
export function tierForRank(rank: number): RewardTier; // 1→champion, 2-3→elite, 4-10→vanguard, else participant
export async function payoutBoss(bossId: string): Promise<boolean>; // false if already paid; ability via increment_ability_score; growth via applyAgentGrowth to getOrBuildSquad (or best single agent); trophies
export async function getTrophies(playerIds: string[]): Promise<Record<string, { bossId: string; tier: string }[]>>;
export async function getTotalDamage(bossId: string): Promise<number>;
```
Writes use `getAdminSupabase()`; demo mode in-memory with the same atomic semantics (synchronous JS section).
- [ ] Step 1 tests (demo): concurrent `Promise.all` of two damage applications that together exceed HP → exactly one killed, `lastHitPlayerId` = that player; damage after defeat records contribution and returns killed false; payout twice → second false; tiers by rank; expired payout halves ability (floor); contributions sum = total damage.
- [ ] Step 2 FAIL → 3 implement → 4 PASS → 5 commit `feat(raid): raid persistence, atomic damage, payouts, migration 005`.

### Task 3: Raid service mode + raid state API

**Files:** Modify `src/lib/tactical/battle-service.ts`; Create `src/app/api/raid/route.ts` (GET `?wallet=` → `{ boss, def, phase, weakness, contributions (top 20, with rank), myRank, attemptsLeft, recentHits }`), `src/lib/raid/raid-service.ts` (`getRaidView(wallet)`); Test `src/lib/raid/__tests__/raid-service.test.ts`
- `startBattle` `mode:"raid"`: player → `getActiveBoss` (null → 409 `no_active_boss`) → attempts `countRaidAttemptsToday + countActiveToday({playerId, mode:"raid"})` ≥ 3 → 429 `raid_limit_reached` → resolve stale raid sessions → squad = `getOrBuildSquad` or best single agent (`solo:true`), none → 409 `no_agents` → `createRaidAttempt` with `hpAtStart = boss.hpRemaining` → session.
- `takeTurn` raid branch uses `resolveRaidRound` / `runRaidAuto`.
- `finalizeSession` raid branch: `applyRaidDamage` (label = lead agent name) → growth via `squadGrowth` attacker only → if `killed` `payoutBoss` → response `{ damage, hpRemaining, killed, growth }`. If `applyRaidDamage` throws, leave session active with `state.finished = true` (next start retries finalise via stale-session resolution).
- [ ] Step 1 tests: no boss → 409; 4th attempt → 429; solo player gets `solo:true`; auto attempt reduces boss HP by returned damage; killing attempt triggers payout (trophies exist).
- [ ] Step 2 FAIL → 3 implement → 4 PASS → 5 commit `feat(raid): raid battle mode and raid view API`.

### Task 4: Weekly cron

**Files:** Create `src/lib/raid/raid-cron.ts` (`runRaidWeekly(now: Date): Promise<{ closed: string | null; spawned: string }>`, `weekStartOf(now): string` Monday UTC, `nextBossHp(prev, totalDamage, now)`), `src/app/api/cron/raid-weekly/route.ts` (same auth pattern as daily-growth); Modify `vercel.json` (add `{ "path": "/api/cron/raid-weekly", "schedule": "0 0 * * 1" }`); Test `src/lib/raid/__tests__/raid-cron.test.ts`
Logic: current = getLatestBoss; if current.weekStart === weekStartOf(now) → return (idempotent). If current active → `setBossStatus(expired)` → `payoutBoss` (halved). If defeated and unpaid → `payoutBoss`. Spawn `bossForWeek(rotationIndex = BOSSES.indexOf(prev)+1 or 0)` with `computeBossStats(getAllAgentsWithDimensions())`, HP formula.
- [ ] Step 1 tests: first run spawns with first-boss HP; second run same week no-op; next week expires alive boss and pays half; HP formula for killed on day 2 → `min(1.1×2.5,1.6)=1.6×damage`, clamps to MIN/MAX.
- [ ] Step 2 FAIL → 3 implement → 4 PASS → 5 commit `feat(raid): weekly raid cron`.

### Task 5: Raid page, boss stage, live updates, nav

**Files:** Create `src/app/raid/page.tsx`, `src/components/BossStage.tsx` (large `PixelSprite` (size 192) with CSS idle float, red glow by phase, hit flash on HP change, phase banner, defeat overlay "SLAIN" shown once per boss via localStorage), `src/hooks/useRaidLive.ts` (fetch `/api/raid?wallet=`, subscribe Realtime to boss UPDATE + hits INSERT via `getSupabase()`, on `CHANNEL_ERROR`/`TIMED_OUT` or no Supabase → `setInterval` 15s refetch; cleanup on unmount); Modify `src/components/NavBar.tsx` (Guide → Raid `🐉` `/raid`), `src/app/dashboard/page.tsx` (raid banner with HP % + link; "Guide" link); the raid attack renders `SquadBattle` with the raid state (boss as single defender; banner shows weakness + ULTIMATE warning from intent kind).
- `SquadBattle` gets an optional `raid?: { weakness: Category; phase: RaidPhase }` prop to show weakness chip and ULTIMATE banner ("⚠ ULTIMATE incoming — GUARD!").
- Result screen: damage dealt, new rank, "BOSS SLAIN!" when killed.
- [ ] Step 1 test: `useRaidLive` falls back to polling when `getSupabase()` returns null (fake timers, fetch called again after 15s).
- [ ] Step 2 FAIL → 3 implement → 4 PASS → manual demo run (spawn via calling `runRaidWeekly` in dev route or test) → 5 commit `feat(raid): raid page, boss stage, live updates, nav`.

### Task 6: Trophies display + docs

**Files:** Modify `src/app/rank/page.tsx` (tab "Raid" — hall of fame: past bosses with champion + slayer, and trophy counts per player via `getTrophies`), `src/app/agents/[id]/page.tsx` (owner trophies row), `CLAUDE.md` (migrations 003–005 order, Realtime enable step, raid cron), `src/app/guide/page.tsx` (Squads + Raids sections).
- [ ] Steps: implement → `pnpm exec tsc --noEmit` → `pnpm test` (only baseline failures) → `pnpm build` → commit `feat(raid): trophies display; docs`.
