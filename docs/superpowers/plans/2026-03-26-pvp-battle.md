# PvP Battle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add async PvP battles where a player picks one of their agents, the server randomly selects an opponent from another player, resolves a battle, applies dimension growth, and records wins/losses.

**Architecture:** A single server-side API route (`POST /api/pvp/battle`) owns all PvP logic — opponent selection, battle resolution, growth application, and ranking updates. The frontend replaces the "coming soon" stub with a functional PvP section that reuses the existing `BattlePlayback` component. Rankings page gets a W-L column.

**Tech Stack:** Next.js App Router (route handler), Supabase, Vitest, existing `resolveBattle()` engine

---

## Spec Reference
`docs/superpowers/specs/2026-03-26-pvp-battle-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `supabase/migrations/pvp.sql` | Create | SQL to run in Supabase dashboard: adds `pvp` column + `levelup_pvp_stats` table |
| `src/lib/types.ts` | Modify | Add `PvpStats` interface; add `pvp?: boolean` to `BattleLog` |
| `src/lib/db.ts` | Modify | Update `getAgentFightsToday` (add `pvp=false` filter); add `getPvpFightsToday`, `savePvpBattleLog`, `updatePvpStats`, `getPvpStatsForAgents` |
| `src/lib/__tests__/pvp-db.test.ts` | Create | Vitest unit tests for new DB functions (demo mode) |
| `src/app/api/pvp/battle/route.ts` | Create | POST handler: validate → pick opponent → battle → save → return |
| `src/app/battle/page.tsx` | Modify | Replace PvP stub; add PvP agent selector, API call, results screen |
| `src/app/rank/page.tsx` | Modify | Load PvP stats bulk; render W-L badge per agent |

---

## Task 1: Supabase Migration SQL

**Files:**
- Create: `supabase/migrations/pvp.sql`

> This SQL must be run manually in the Supabase dashboard (SQL Editor). It is not auto-applied.

- [ ] **Step 1: Create the migration file**

```sql
-- supabase/migrations/pvp.sql

-- 1. Add pvp flag to battle logs (default false = training)
ALTER TABLE levelup_battle_logs ADD COLUMN IF NOT EXISTS pvp boolean NOT NULL DEFAULT false;

-- 2. Create PvP stats table
CREATE TABLE IF NOT EXISTS levelup_pvp_stats (
  agent_id  TEXT PRIMARY KEY REFERENCES levelup_agents(id) ON DELETE CASCADE,
  wins      INT NOT NULL DEFAULT 0,
  losses    INT NOT NULL DEFAULT 0
);

-- 3. Atomic upsert+increment function used by updatePvpStats
CREATE OR REPLACE FUNCTION levelup_pvp_increment(p_agent_id text, p_wins int, p_losses int)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO levelup_pvp_stats (agent_id, wins, losses)
  VALUES (p_agent_id, p_wins, p_losses)
  ON CONFLICT (agent_id) DO UPDATE
    SET wins = levelup_pvp_stats.wins + EXCLUDED.wins,
        losses = levelup_pvp_stats.losses + EXCLUDED.losses;
END;
$$;
```

- [ ] **Step 2: Run the SQL in Supabase dashboard**

Open Supabase → SQL Editor → paste and run the contents of `supabase/migrations/pvp.sql`.

Verify: `levelup_battle_logs` has a `pvp` column; `levelup_pvp_stats` table exists.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/pvp.sql
git commit -m "chore: add pvp migration SQL"
```

---

## Task 2: Types

**Files:**
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Add `pvp?: boolean` to `BattleLog`**

In `src/lib/types.ts`, find the `BattleLog` interface and add the field:

```ts
export interface BattleLog {
  id: string;
  attackerId: string;
  defenderId: string;
  winnerId: string;
  rounds: BattleRound[];
  attackerGrowth: Record<number, number>;
  defenderGrowth: Record<number, number>;
  createdAt: string;
  pvp?: boolean;  // true for PvP battles, undefined/false for training
}
```

- [ ] **Step 2: Add `PvpStats` interface**

Append to `src/lib/types.ts`:

```ts
export interface PvpStats {
  agentId: string;
  wins: number;
  losses: number;
}
```

- [ ] **Step 3: Verify no TypeScript errors**

```bash
pnpm build 2>&1 | head -30
```

Expected: no new errors from types.ts changes.

- [ ] **Step 4: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat: add PvpStats type and pvp flag to BattleLog"
```

---

## Task 3: DB Functions

**Files:**
- Modify: `src/lib/db.ts`
- Create: `src/lib/__tests__/pvp-db.test.ts`

### Step A: Write failing tests first

- [ ] **Step 1: Write failing tests**

Create `src/lib/__tests__/pvp-db.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import {
  getOrCreatePlayer,
  getPvpFightsToday,
  savePvpBattleLog,
  updatePvpStats,
  getPvpStatsForAgents,
} from "../db";
import { resolveBattle } from "../battle-engine";
import { getAgentWithDimensions } from "../db";

// Helper: create a minimal battle log (demo mode, no real agents needed for stats tests)
function makePvpLog(attackerId: string, defenderId: string, winnerId: string) {
  return {
    id: crypto.randomUUID(),
    attackerId,
    defenderId,
    winnerId,
    rounds: [],
    attackerGrowth: {},
    defenderGrowth: {},
    createdAt: new Date().toISOString(),
    pvp: true as const,
  };
}

describe("PvP DB functions (demo mode)", () => {
  describe("getPvpFightsToday", () => {
    it("returns 0 when agent has no PvP fights today", async () => {
      const count = await getPvpFightsToday("agent-no-pvp");
      expect(count).toBe(0);
    });

    it("increments after a PvP battle is saved", async () => {
      const agentId = "pvp-attacker-" + crypto.randomUUID();
      const opponentId = "pvp-defender-" + crypto.randomUUID();
      const log = makePvpLog(agentId, opponentId, agentId);
      await savePvpBattleLog(log);
      const count = await getPvpFightsToday(agentId);
      expect(count).toBe(1);
    });

    it("does not count training (non-pvp) battles", async () => {
      // Training battles are saved via saveBattleLog (no pvp flag)
      // getPvpFightsToday should return 0 for such agents
      const agentId = "training-only-" + crypto.randomUUID();
      const count = await getPvpFightsToday(agentId);
      expect(count).toBe(0);
    });
  });

  describe("updatePvpStats + getPvpStatsForAgents", () => {
    it("returns zeros for agents with no PvP history", async () => {
      const agentId = "fresh-agent-" + crypto.randomUUID();
      const stats = await getPvpStatsForAgents([agentId]);
      expect(stats[agentId]).toEqual({ agentId, wins: 0, losses: 0 });
    });

    it("records a win and a loss", async () => {
      const winnerId = "winner-" + crypto.randomUUID();
      const loserId = "loser-" + crypto.randomUUID();
      await updatePvpStats(winnerId, loserId);
      const stats = await getPvpStatsForAgents([winnerId, loserId]);
      expect(stats[winnerId].wins).toBe(1);
      expect(stats[winnerId].losses).toBe(0);
      expect(stats[loserId].wins).toBe(0);
      expect(stats[loserId].losses).toBe(1);
    });

    it("accumulates multiple wins", async () => {
      const winnerId = "multi-winner-" + crypto.randomUUID();
      const loserId1 = "loser1-" + crypto.randomUUID();
      const loserId2 = "loser2-" + crypto.randomUUID();
      await updatePvpStats(winnerId, loserId1);
      await updatePvpStats(winnerId, loserId2);
      const stats = await getPvpStatsForAgents([winnerId]);
      expect(stats[winnerId].wins).toBe(2);
    });

    it("returns stats for multiple agents in one call", async () => {
      const a = "bulk-a-" + crypto.randomUUID();
      const b = "bulk-b-" + crypto.randomUUID();
      await updatePvpStats(a, b);
      const stats = await getPvpStatsForAgents([a, b]);
      expect(Object.keys(stats)).toHaveLength(2);
    });
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
pnpm test src/lib/__tests__/pvp-db.test.ts
```

Expected: multiple failures — `getPvpFightsToday is not a function`, etc.

### Step B: Implement DB functions

- [ ] **Step 3: Add in-memory stores to `src/lib/db.ts`**

Near the top of `src/lib/db.ts`, alongside the existing `const localBattleLogs: BattleLog[] = [];` line, add:

```ts
const localPvpBattleLogs: BattleLog[] = [];  // const — mutated via .push, not reassigned
const localPvpStats: PvpStats[] = [];
```

- [ ] **Step 4: Update `getAgentFightsToday` to filter `pvp = false`**

Find the existing `getAgentFightsToday` function. In the Supabase branch, add `.eq("pvp", false)` before `.gte(...)`:

```ts
// Supabase branch — add .eq("pvp", false)
const { count, error } = await sb
  .from("levelup_battle_logs")
  .select("*", { count: "exact", head: true })
  .or(`attacker_id.eq.${agentId},defender_id.eq.${agentId}`)
  .eq("pvp", false)           // ← add this line
  .gte("created_at", sinceISO);
```

In the demo branch, filter out PvP logs:

```ts
// Demo mode — exclude pvp battles
return localBattleLogs.filter(
  (l) =>
    !l.pvp &&                                          // ← add this
    (l.attackerId === agentId || l.defenderId === agentId) &&
    l.createdAt >= sinceISO
).length;
```

- [ ] **Step 5: Add `getPvpFightsToday`**

Append after `getAgentFightsToday`:

```ts
// ---------------------------------------------------------------------------
// getPvpFightsToday
// ---------------------------------------------------------------------------
export async function getPvpFightsToday(agentId: string): Promise<number> {
  const sb = getSupabase();
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const sinceISO = todayStart.toISOString();

  if (sb) {
    const { count, error } = await sb
      .from("levelup_battle_logs")
      .select("*", { count: "exact", head: true })
      .or(`attacker_id.eq.${agentId},defender_id.eq.${agentId}`)
      .eq("pvp", true)
      .gte("created_at", sinceISO);
    if (error) return 0;
    return count ?? 0;
  }

  // Demo mode — always uses midnight cutoff (no recharge for PvP)
  return localPvpBattleLogs.filter(
    (l) =>
      (l.attackerId === agentId || l.defenderId === agentId) &&
      l.createdAt >= sinceISO
  ).length;
}
```

- [ ] **Step 6: Add `savePvpBattleLog`**

```ts
// ---------------------------------------------------------------------------
// savePvpBattleLog
// ---------------------------------------------------------------------------
export async function savePvpBattleLog(log: BattleLog): Promise<void> {
  const sb = getSupabase();

  if (sb) {
    const { error } = await sb.from("levelup_battle_logs").insert({
      id: log.id,
      attacker_id: log.attackerId,
      defender_id: log.defenderId,
      winner_id: log.winnerId,
      rounds: log.rounds,
      attacker_growth: log.attackerGrowth,
      defender_growth: log.defenderGrowth,
      pvp: true,
    });
    if (error) throw error;

    for (const [dimIdStr, delta] of Object.entries(log.attackerGrowth)) {
      await sb.rpc("levelup_increment_dimension", {
        p_agent_id: log.attackerId,
        p_dimension_id: Number(dimIdStr),
        p_delta: delta,
      });
    }
    for (const [dimIdStr, delta] of Object.entries(log.defenderGrowth)) {
      await sb.rpc("levelup_increment_dimension", {
        p_agent_id: log.defenderId,
        p_dimension_id: Number(dimIdStr),
        p_delta: delta,
      });
    }
    return;
  }

  // Demo mode
  localPvpBattleLogs.push({ ...log, pvp: true });

  for (const [dimIdStr, delta] of Object.entries(log.attackerGrowth)) {
    const dimId = Number(dimIdStr);
    const dim = localDimensions.find(
      (d) => d.agentId === log.attackerId && d.dimensionId === dimId
    );
    if (dim) dim.value += delta;
  }
  for (const [dimIdStr, delta] of Object.entries(log.defenderGrowth)) {
    const dimId = Number(dimIdStr);
    const dim = localDimensions.find(
      (d) => d.agentId === log.defenderId && d.dimensionId === dimId
    );
    if (dim) dim.value += delta;
  }
}
```

- [ ] **Step 7: Add `updatePvpStats`**

Uses `levelup_pvp_increment` Postgres RPC (defined in the migration SQL from Task 1) for atomic upsert+increment.

```ts
// ---------------------------------------------------------------------------
// updatePvpStats
// ---------------------------------------------------------------------------
export async function updatePvpStats(
  winnerId: string,
  loserId: string
): Promise<void> {
  const sb = getSupabase();

  if (sb) {
    // Use atomic RPC for upsert+increment (defined in supabase/migrations/pvp.sql)
    await sb.rpc("levelup_pvp_increment", { p_agent_id: winnerId, p_wins: 1, p_losses: 0 });
    await sb.rpc("levelup_pvp_increment", { p_agent_id: loserId, p_wins: 0, p_losses: 1 });
    return;
  }

  // Demo mode
  for (const [id, isWinner] of [[winnerId, true], [loserId, false]] as [string, boolean][]) {
    const existing = localPvpStats.find((s) => s.agentId === id);
    if (existing) {
      if (isWinner) existing.wins += 1;
      else existing.losses += 1;
    } else {
      localPvpStats.push({
        agentId: id,
        wins: isWinner ? 1 : 0,
        losses: isWinner ? 0 : 1,
      });
    }
  }
}
```

- [ ] **Step 8: Add `getPvpStatsForAgents`**

```ts
// ---------------------------------------------------------------------------
// getPvpStatsForAgents
// ---------------------------------------------------------------------------
export async function getPvpStatsForAgents(
  agentIds: string[]
): Promise<Record<string, PvpStats>> {
  const sb = getSupabase();
  const result: Record<string, PvpStats> = {};

  if (sb) {
    const { data, error } = await sb
      .from("levelup_pvp_stats")
      .select("*")
      .in("agent_id", agentIds);

    const rows = error ? [] : (data ?? []);
    for (const row of rows) {
      result[row.agent_id] = { agentId: row.agent_id, wins: row.wins, losses: row.losses };
    }
  } else {
    // Demo mode
    for (const stat of localPvpStats) {
      if (agentIds.includes(stat.agentId)) {
        result[stat.agentId] = { ...stat };
      }
    }
  }

  // Fill zeros for agents with no history
  for (const id of agentIds) {
    if (!result[id]) result[id] = { agentId: id, wins: 0, losses: 0 };
  }

  return result;
}
```

> **Demo-mode history note:** In demo mode, `savePvpBattleLog` pushes to `localPvpBattleLogs` (not `localBattleLogs`). This means PvP battles are invisible to `getBattleLogs` and `getBattleLogsCount` in demo mode — those functions only read `localBattleLogs`. In Supabase mode, all battles share the same table and are visible everywhere. This is an accepted demo-mode divergence.

- [ ] **Step 9: Add `PvpStats` import at top of db.ts**

In the import block at the top of `src/lib/db.ts`, add `PvpStats` to the existing type imports:

```ts
import type {
  Agent,
  AgentDimension,
  AgentWithDimensions,
  BattleLog,
  GrowthLog,
  Player,
  PvpStats,
  RoleCategory,
} from "./types";
```

Then remove the inline `import("./types").PvpStats` usages (replace with just `PvpStats`).

- [ ] **Step 10: Run tests — verify they pass**

```bash
pnpm test src/lib/__tests__/pvp-db.test.ts
```

Expected: all tests pass.

- [ ] **Step 11: Run full test suite — verify no regressions**

```bash
pnpm test
```

Expected: all existing tests still pass.

- [ ] **Step 12: Commit**

```bash
git add src/lib/db.ts src/lib/__tests__/pvp-db.test.ts
git commit -m "feat: add PvP DB functions (getPvpFightsToday, savePvpBattleLog, updatePvpStats, getPvpStatsForAgents)"
```

---

## Task 4: API Route

**Files:**
- Create: `src/app/api/pvp/battle/route.ts`

- [ ] **Step 1: Create the route handler**

Create `src/app/api/pvp/battle/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import {
  getPvpFightsToday,
  savePvpBattleLog,
  updatePvpStats,
  getAgentWithDimensions,
  getAllAgentsWithDimensions,
} from "@/lib/db";
import { resolveBattle } from "@/lib/battle-engine";

const MAX_PVP_FIGHTS_PER_DAY = 3;

export async function POST(req: NextRequest) {
  let body: { agentId?: string; walletAddress?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  const { agentId, walletAddress } = body;
  if (!agentId || !walletAddress) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  const sb = getSupabase();

  // --- 1. Verify agent ownership ---
  if (sb) {
    const { data: player } = await sb
      .from("levelup_players")
      .select("id")
      .eq("wallet_address", walletAddress)
      .single();

    if (!player) {
      return NextResponse.json({ error: "not_owner" }, { status: 403 });
    }

    const { data: agent } = await sb
      .from("levelup_agents")
      .select("player_id")
      .eq("id", agentId)
      .single();

    if (!agent || agent.player_id !== player.id) {
      return NextResponse.json({ error: "not_owner" }, { status: 403 });
    }

    // --- 2. Check PvP fight limit ---
    const fightsToday = await getPvpFightsToday(agentId);
    if (fightsToday >= MAX_PVP_FIGHTS_PER_DAY) {
      return NextResponse.json({ error: "fight_limit_reached" }, { status: 429 });
    }

    // --- 3. Pick a random opponent from another player ---
    const { data: allAgents } = await sb
      .from("levelup_agents")
      .select("id, player_id")
      .neq("player_id", player.id);

    const eligible = allAgents ?? [];
    if (eligible.length === 0) {
      return NextResponse.json({ error: "no_opponent" }, { status: 409 });
    }

    const opponent = eligible[Math.floor(Math.random() * eligible.length)];

    // --- 4. Load full agent data ---
    const [attacker, defender] = await Promise.all([
      getAgentWithDimensions(agentId),
      getAgentWithDimensions(opponent.id),
    ]);

    if (!attacker || !defender) {
      return NextResponse.json({ error: "internal" }, { status: 500 });
    }

    // --- 5. Resolve battle ---
    const battleLog = resolveBattle(attacker, defender);

    // --- 6. Save log + apply growth ---
    await savePvpBattleLog(battleLog);

    // --- 7. Update W/L stats ---
    const loserId =
      battleLog.winnerId === attacker.id ? defender.id : attacker.id;
    await updatePvpStats(battleLog.winnerId, loserId);

    // --- 8. Return result ---
    return NextResponse.json({ battleLog, opponentAgent: defender, attackerAgent: attacker });
  }

  // Demo mode — no Supabase, use statically-imported getAllAgentsWithDimensions
  const allAgents = await getAllAgentsWithDimensions();
  const attackerAgent = allAgents.find((a) => a.id === agentId);
  if (!attackerAgent) {
    return NextResponse.json({ error: "not_owner" }, { status: 403 });
  }

  const fightsToday = await getPvpFightsToday(agentId);
  if (fightsToday >= MAX_PVP_FIGHTS_PER_DAY) {
    return NextResponse.json({ error: "fight_limit_reached" }, { status: 429 });
  }

  const others = allAgents.filter((a) => a.playerId !== attackerAgent.playerId);
  if (others.length === 0) {
    return NextResponse.json({ error: "no_opponent" }, { status: 409 });
  }

  const opponent = others[Math.floor(Math.random() * others.length)];
  const battleLog = resolveBattle(attackerAgent, opponent);
  await savePvpBattleLog(battleLog);
  const loserId = battleLog.winnerId === attackerAgent.id ? opponent.id : attackerAgent.id;
  await updatePvpStats(battleLog.winnerId, loserId);

  return NextResponse.json({ battleLog, opponentAgent: opponent, attackerAgent });
}
```

> **Demo-mode ownership note:** In demo mode (no Supabase), the route skips the wallet ownership check — any `walletAddress` can fight as any agent. This is an accepted limitation of the stateless in-memory demo mode, consistent with how other demo-mode functions work (no real auth).

- [ ] **Step 2: Verify no TypeScript errors**

```bash
pnpm build 2>&1 | head -40
```

Expected: no new errors.

- [ ] **Step 3: Manual smoke test (if dev server is running)**

```bash
# In a separate terminal: pnpm dev
curl -X POST http://localhost:3000/api/pvp/battle \
  -H "Content-Type: application/json" \
  -d '{"agentId":"invalid","walletAddress":"invalid"}'
# Expected: 403 {"error":"not_owner"} (Supabase) or 403 (demo)
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/pvp/battle/route.ts
git commit -m "feat: add POST /api/pvp/battle route handler"
```

---

## Task 5: Battle Page — PvP Section

**Files:**
- Modify: `src/app/battle/page.tsx`

The current page has a "PvP coming soon" stub in the select phase and uses `selected: string[]` (multi-select for training). We add a separate PvP state alongside training.

- [ ] **Step 1: Add PvP state variables**

At the top of the `BattlePage` component, alongside existing state, add:

```ts
// PvP state
const [pvpSelected, setPvpSelected] = useState<string | null>(null);
const [pvpFightsToday, setPvpFightsToday] = useState<Record<string, number>>({});
const [pvpLoading, setPvpLoading] = useState(false);
const [pvpError, setPvpError] = useState<string | null>(null);
const [pvpBattleLog, setPvpBattleLog] = useState<BattleLog | null>(null);
const [pvpOpponent, setPvpOpponent] = useState<AgentWithDimensions | null>(null);
const [pvpAttacker, setPvpAttacker] = useState<AgentWithDimensions | null>(null); // from API response
const [pvpPhase, setPvpPhase] = useState<"select" | "battle">("select");
const [pvpPlaybackDone, setPvpPlaybackDone] = useState(false);
```

- [ ] **Step 2: Add `getPvpFightsToday` and `getPvpStatsForAgents` to the db import**

Update the existing db import block at the top of `src/app/battle/page.tsx`:

```ts
import {
  getAgentWithDimensions,
  saveBattleLog,
  getAgentFightsToday,
  rechargeAgentFights,
  getPvpFightsToday,
  getPvpStatsForAgents,
} from "@/lib/db";
import type { AgentWithDimensions, BattleLog, PvpStats } from "@/lib/types";
```

- [ ] **Step 2b: Load PvP fight counts alongside training counts**

In the existing `loadAll` function inside the `useEffect` that loads agents, add PvP count loading:

```ts
// Inside loadAll():
const pvpCounts: Record<string, number> = {};
for (const agent of agents) {
  pvpCounts[agent.id] = await getPvpFightsToday(agent.id);
}
setPvpFightsToday(pvpCounts);

// Pre-load lifetime PvP record for the current player's agents
// so results screen shows true lifetime W/L, not just current-session count
const myAgentIds = agents.map((a) => a.id);
if (myAgentIds.length > 0) {
  const allStats = await getPvpStatsForAgents(myAgentIds);
  // Store first agent's stats as initial state (updated per-agent after each fight)
  // pvpMyStats is refreshed in startPvpBattle with the just-selected agent's stats
  // so we don't need to pre-select; just ensure getPvpStatsForAgents is warmed up
  // (No state set here — pvpMyStats is set per-fight in startPvpBattle)
}
```

> **Note:** We warm up `getPvpStatsForAgents` in `loadAll` but only set `pvpMyStats` state inside `startPvpBattle` (per selected agent, immediately after the fight resolves). This gives the accurate post-fight lifetime record rather than a stale pre-fight snapshot.

Also add `pvpMyStats` state for displaying the updated record after a fight:

```ts
const [pvpMyStats, setPvpMyStats] = useState<PvpStats | null>(null);
```

`pvpMyStats` is **pre-loaded on page mount** (in `loadAll`, see Step 2b) so it reflects lifetime history, and **refreshed after each fight** (in `startPvpBattle`, see Step 3) to reflect the just-completed battle.

- [ ] **Step 3: Add the `startPvpBattle` function**

```ts
async function startPvpBattle() {
  if (!pvpSelected || !publicKey) return;
  setPvpLoading(true);
  setPvpError(null);
  try {
    const res = await fetch("/api/pvp/battle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agentId: pvpSelected,
        walletAddress: publicKey.toBase58(),
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      if (data.error === "fight_limit_reached") {
        setPvpError("Your agent has used all 3 PvP fights today.");
      } else if (data.error === "no_opponent") {
        setPvpError("No opponents available yet. Check back soon!");
      } else {
        setPvpError("Something went wrong. Please try again.");
      }
      return;
    }
    setPvpBattleLog(data.battleLog);
    setPvpOpponent(data.opponentAgent);
    setPvpAttacker(data.attackerAgent); // use API-provided attacker instead of searching allAgentsFull
    setPvpFightsToday((prev) => ({
      ...prev,
      [pvpSelected]: (prev[pvpSelected] ?? 0) + 1,
    }));
    // Fetch updated PvP record for the results screen
    const updatedStats = await getPvpStatsForAgents([pvpSelected]);
    setPvpMyStats(updatedStats[pvpSelected] ?? null);
    setPvpPhase("battle");
  } catch {
    setPvpError("Network error. Please try again.");
  } finally {
    setPvpLoading(false);
  }
}
```

- [ ] **Step 4: Add `resetPvp` function**

```ts
function resetPvp() {
  setPvpPhase("select");
  setPvpSelected(null);
  setPvpBattleLog(null);
  setPvpOpponent(null);
  setPvpAttacker(null);
  setPvpMyStats(null);
  setPvpPlaybackDone(false);
  setPvpError(null);
}
```

- [ ] **Step 5: Move `renderGrowth` to component level (do this BEFORE adding PvP JSX)**

Cut `renderGrowth` from inside the training battle `if` block and paste it as a standalone function at the component level, above all `return` statements:

```ts
function renderGrowth(growth: Record<number, number>, agentName: string) {
  const entries = Object.entries(growth);
  if (entries.length === 0) return null;
  return (
    <div className="bg-gray-900 border border-gray-800 rounded px-3 py-2 flex items-center gap-2 flex-wrap">
      <span className="font-mono text-xs text-gray-400 shrink-0">{agentName}:</span>
      {entries.map(([dimIdStr, delta]) => {
        const dimId = Number(dimIdStr);
        const dim = DIMENSIONS.find((d) => d.id === dimId);
        const name = dim?.name ?? `Dim ${dimId}`;
        return (
          <span
            key={dimId}
            className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono bg-green-900/50 text-green-400 border border-green-800"
          >
            +{delta.toFixed(1)} {name}
          </span>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 6: Replace the PvP stub in the JSX**

Find the existing PvP stub block:

```tsx
{/* PvP Section */}
<div className="mb-8 bg-gray-900 border border-gray-800 rounded-lg p-6 text-center">
  <div className="flex items-center justify-center gap-3 mb-3">
    <span className="text-3xl">⚔</span>
    <h2 className="text-xl font-mono font-bold text-red-400">PvP Battle</h2>
    <span className="text-3xl">⚔</span>
  </div>
  <p className="font-mono text-gray-500 text-sm animate-pulse">
    PvP coming soon.....
  </p>
</div>
```

Replace with the functional PvP section. The PvP section renders differently based on `pvpPhase`:

**When `pvpPhase === "select"`:**

```tsx
{/* PvP Section */}
<div className="mb-8 bg-gray-900 border border-gray-800 rounded-lg p-6">
  <div className="flex items-center justify-center gap-3 mb-4">
    <span className="text-3xl">⚔</span>
    <h2 className="text-xl font-mono font-bold text-red-400">PvP Battle</h2>
    <span className="text-3xl">⚔</span>
  </div>
  <p className="font-mono text-xs text-gray-500 text-center mb-4">
    Select an agent — we'll find a random opponent from another player
  </p>

  {pvpError && (
    <div className="mb-3 px-3 py-2 bg-red-500/10 border border-red-700/30 rounded text-red-400 font-mono text-xs text-center">
      {pvpError}
    </div>
  )}

  <div className="grid grid-cols-3 gap-2 mb-4">
    {allAgentsFull.map((agent) => {
      const pvpFights = pvpFightsToday[agent.id] ?? 0;
      const pvpRemaining = Math.max(0, MAX_PVP_FIGHTS - pvpFights);
      const disabled = pvpRemaining <= 0;
      const isSelected = pvpSelected === agent.id;
      return (
        <div
          key={agent.id}
          onClick={() => {
            if (disabled) return;
            setPvpSelected(isSelected ? null : agent.id);
          }}
          className={`border rounded-lg p-3 text-center transition-all duration-200 relative ${
            disabled
              ? "border-gray-800 bg-gray-900/50 opacity-60 cursor-not-allowed"
              : isSelected
              ? "border-red-500 bg-red-900/20 ring-1 ring-red-500/50 scale-[1.03] cursor-pointer"
              : "border-gray-700 bg-gray-900 hover:border-gray-500 cursor-pointer"
          }`}
        >
          <div className="flex justify-center mb-1.5">
            <PixelSprite
              spriteSeed={agent.spriteSeed as Record<string, number>}
              role={agent.role}
              size={52}
            />
          </div>
          <p className="font-mono text-xs font-bold text-white truncate">{agent.name}</p>
          <span className={`inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded font-mono ${ROLE_BADGE[agent.role]}`}>
            {agent.role}
          </span>
          <p className={`font-mono text-[10px] mt-1 ${disabled ? "text-red-400" : "text-gray-500"}`}>
            PvP: {pvpRemaining}/{MAX_PVP_FIGHTS}
          </p>
        </div>
      );
    })}
  </div>

  <div className="flex justify-center">
    <button
      onClick={startPvpBattle}
      disabled={!pvpSelected || pvpLoading}
      className="px-6 py-2.5 bg-gradient-to-r from-red-700 to-red-500 hover:from-red-600 hover:to-red-400 disabled:opacity-40 disabled:cursor-not-allowed text-white font-mono font-bold text-sm rounded-lg transition-all"
    >
      {pvpLoading ? "Searching..." : "Find Opponent ⚔"}
    </button>
  </div>
</div>
```

Add `const MAX_PVP_FIGHTS = 3;` near the top of the file alongside `MAX_FIGHTS_PER_DAY`.

**When `pvpPhase === "battle"` and `pvpBattleLog && pvpOpponent`:**

Add this block before the training select phase `return`. Note: the requesting player's agent is always `attacker` in `battleLog` (because `resolveBattle(attackerAgent, opponent)` is called with player's agent first), so `attackerGrowth` = my agent's growth.

```tsx
if (pvpPhase === "battle" && pvpBattleLog && pvpOpponent && pvpAttacker) {
  // pvpAttacker comes from API response — guaranteed non-null, no allAgentsFull lookup needed
  const myAgentId = pvpBattleLog.attackerId;
  const didWin = pvpBattleLog.winnerId === myAgentId;

  return (
    <main className="min-h-screen bg-gray-950 text-white p-4 pb-32 max-w-2xl mx-auto">
      <h1 className="text-xl font-mono font-bold mb-1 text-center">PvP Battle</h1>
      <p className="font-mono text-xs text-center text-gray-500 mb-3">
        vs {pvpOpponent.name} ({pvpOpponent.role})
      </p>

      <BattlePlayback
        battleLog={pvpBattleLog}
        attacker={pvpAttacker}
        defender={pvpOpponent}
        onComplete={() => setPvpPlaybackDone(true)}
      />

      {pvpPlaybackDone && (
        <div className="mt-3 space-y-3 animate-fadeIn">
          {/* Win/Loss banner */}
          <div className={`text-center py-3 rounded-lg font-mono font-bold text-lg ${
            didWin
              ? "bg-green-900/30 border border-green-700/40 text-green-400"
              : "bg-red-900/20 border border-red-800/30 text-red-400"
          }`}>
            {didWin ? "Victory! ⚔" : "Defeat"}
          </div>

          {/* Updated PvP record */}
          {pvpMyStats && (
            <p className="text-center font-mono text-xs text-gray-400">
              Your record: <span className="text-green-400">{pvpMyStats.wins}W</span>
              {" - "}
              <span className="text-red-400">{pvpMyStats.losses}L</span>
            </p>
          )}

          {/* Growth */}
          {renderGrowth(pvpBattleLog.attackerGrowth, pvpAttacker.name)}
          {renderGrowth(pvpBattleLog.defenderGrowth, pvpOpponent.name)}

          <div className="flex items-center justify-center gap-4 pt-2">
            <button
              onClick={resetPvp}
              className="px-5 py-2 bg-red-700 hover:bg-red-600 text-white font-mono text-sm rounded transition-colors"
            >
              Fight Again
            </button>
            <Link href="/agents" className="text-sm text-gray-500 font-mono hover:text-gray-400">
              Back to Agents
            </Link>
          </div>
        </div>
      )}
    </main>
  );
}
```

- [ ] **Step 7: TypeScript check**

```bash
pnpm build 2>&1 | head -40
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/app/battle/page.tsx
git commit -m "feat: implement PvP battle section on battle page"
```

---

## Task 6: Rank Page — W-L Column

**Files:**
- Modify: `src/app/rank/page.tsx`

- [ ] **Step 1: Add imports and state**

Add `getPvpStatsForAgents` to the existing import from `@/lib/db`:

```ts
import { getAllAgentsWithDimensions, getAllPlayers, getPvpStatsForAgents } from "@/lib/db";
import type { AgentWithDimensions, Player, PvpStats } from "@/lib/types";
```

Add a `pvpStats` state variable:

```ts
const [pvpStats, setPvpStats] = useState<Record<string, PvpStats>>({});
```

- [ ] **Step 2: Load PvP stats in the `load` function**

In the existing `load()` async function, add bulk fetch after sorting:

```ts
async function load() {
  setLoadingData(true);
  const [allAgents, allPlayers] = await Promise.all([
    getAllAgentsWithDimensions(),
    getAllPlayers(),
  ]);
  allAgents.sort((a, b) => getTotalAbility(b) - getTotalAbility(a));
  setAgents(allAgents);
  setPlayers(allPlayers);

  // Load PvP stats for top 100 agents
  const top100Ids = allAgents.slice(0, 100).map((a) => a.id);
  const stats = await getPvpStatsForAgents(top100Ids);
  setPvpStats(stats);

  setLoadingData(false);
}
```

- [ ] **Step 3: Render W-L badge in the agent row**

In the agent row JSX, find the ability score `<div>` on the right:

```tsx
{/* Ability Score */}
<div className="shrink-0 text-right">
  <div className="font-mono font-bold text-white text-sm">
    {Math.round(totalAbility)}
  </div>
  <div className="font-mono text-[10px] text-gray-500">
    AP
  </div>
</div>
```

Add a W-L badge next to it (wrap both in a flex container or append after):

```tsx
{/* PvP Record */}
{(() => {
  const stat = pvpStats[agent.id];
  if (!stat || (stat.wins === 0 && stat.losses === 0)) return (
    <div className="shrink-0 text-right ml-2">
      <div className="font-mono text-[10px] text-gray-600">—</div>
      <div className="font-mono text-[10px] text-gray-600">W-L</div>
    </div>
  );
  return (
    <div className="shrink-0 text-right ml-2">
      <div className="font-mono text-xs font-bold">
        <span className="text-green-400">{stat.wins}W</span>
        <span className="text-gray-600"> - </span>
        <span className="text-red-400">{stat.losses}L</span>
      </div>
      <div className="font-mono text-[10px] text-gray-500">PvP</div>
    </div>
  );
})()}
```

- [ ] **Step 4: TypeScript check**

```bash
pnpm build 2>&1 | head -40
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/rank/page.tsx
git commit -m "feat: show PvP W-L record on rankings page"
```

---

## Task 7: Final Verification

- [ ] **Step 1: Run full test suite**

```bash
pnpm test
```

Expected: all tests pass.

- [ ] **Step 2: Manual end-to-end test (with dev server)**

```bash
pnpm dev
```

1. Open `/battle` — PvP section should show agent grid with "PvP: 3/3" badges
2. Select an agent → "Find Opponent" button activates
3. Click "Find Opponent" → loading state → battle playback (demo mode: uses local agents)
4. After playback: victory/defeat banner, growth badges, updated count to "PvP: 2/3"
5. Open `/rank` — W-L column shows "—" for all agents (no PvP battles in demo), or stats if Supabase-connected
6. On Supabase: fight count decrements, battle log saved with `pvp=true`, `levelup_pvp_stats` updated

- [ ] **Step 3: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: post-review cleanup for PvP feature"
```
