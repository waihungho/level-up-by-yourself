# PvP Battle — Design Spec

**Date:** 2026-03-26
**Status:** Approved

---

## Overview

Add async PvP battles to the Battle Arena. A player selects one of their agents, clicks "Find Opponent", and the server randomly selects an agent from another player, resolves the battle, applies dimension growth to both agents, and updates win/loss records. No real-time coordination is needed — the opponent does not need to be online.

---

## Requirements

- Async matchmaking: opponent is selected server-side at random from all other players' agents
- Growth + ranking: both agents receive dimension growth; wins/losses tracked per agent
- Separate daily limit: 3 PvP fights per agent per day (independent of the 3 training fights per agent per day)
- Server-authoritative: opponent selection and battle resolution happen on the server to prevent client manipulation

---

## Database

### 1. Add `pvp` column to `levelup_battle_logs`

```sql
ALTER TABLE levelup_battle_logs ADD COLUMN pvp boolean NOT NULL DEFAULT false;
```

This distinguishes PvP battles from training battles in fight-count queries. The existing `getAgentFightsToday` continues counting only training fights (`pvp = false`). A new `getPvpFightsToday` counts only PvP fights (`pvp = true`).

### 2. New table `levelup_pvp_stats`

```sql
CREATE TABLE levelup_pvp_stats (
  agent_id  TEXT PRIMARY KEY REFERENCES levelup_agents(id) ON DELETE CASCADE,
  wins      INT NOT NULL DEFAULT 0,
  losses    INT NOT NULL DEFAULT 0
);
```

One row per agent, upserted after each PvP battle. Drives the ranking display.

---

## API Route

**`POST /api/pvp/battle`**

### Request body
```ts
{ agentId: string; walletAddress: string }
```

### Response (200)
```ts
{ battleLog: BattleLog; opponentAgent: AgentWithDimensions }
```

### Error responses
| Status | Body | Condition |
|--------|------|-----------|
| 400 | `{ error: "missing_fields" }` | Body missing agentId or walletAddress |
| 403 | `{ error: "not_owner" }` | Agent does not belong to this wallet |
| 429 | `{ error: "fight_limit_reached" }` | Agent has used all 3 PvP fights today |
| 409 | `{ error: "no_opponent" }` | No eligible opponent found (only 1 player) |
| 500 | `{ error: "internal" }` | Unexpected error |

### Server logic (in order)
1. Parse and validate `agentId` + `walletAddress` from request body
2. Look up the player by `walletAddress`; verify agent's `player_id` matches → 403 if not
3. Call `getPvpFightsToday(agentId)`; reject with 429 if ≥ 3
4. Fetch all agents from other players (`player_id != requestingPlayerId`); pick one at random → 409 if none
5. Fetch full agent-with-dimensions for both attacker and opponent
6. Call `resolveBattle(attacker, opponent)` (existing engine, unchanged)
7. Call `savePvpBattleLog(log)` — saves to `levelup_battle_logs` with `pvp: true`, applies dimension growth via `levelup_increment_dimension` RPC
8. Call `updatePvpStats(winnerId, loserId)` — upserts `levelup_pvp_stats` for both
9. Return `{ battleLog, opponentAgent }`

---

## New DB Functions (`src/lib/db.ts`)

### `getPvpFightsToday(agentId: string): Promise<number>`
Counts rows in `levelup_battle_logs` where agent is attacker or defender, `pvp = true`, and `created_at >= today midnight UTC`. Mirrors `getAgentFightsToday` with the `pvp` filter.

### `savePvpBattleLog(log: BattleLog): Promise<void>`
Same as `saveBattleLog` but inserts with `pvp: true`. Applies dimension growth for both agents via `levelup_increment_dimension` RPC.

### `updatePvpStats(winnerId: string, loserId: string): Promise<void>`
Upserts `levelup_pvp_stats`:
- Winner: `wins += 1`
- Loser: `losses += 1`

Uses Supabase upsert with `on_conflict: agent_id`.

### `getPvpStatsForAgents(agentIds: string[]): Promise<Record<string, PvpStats>>`
Bulk fetch of `levelup_pvp_stats` rows for a list of agent IDs. Returns a map `{ [agentId]: { wins, losses } }`. Used by the rank page to load all stats in one query.

---

## New Type (`src/lib/types.ts`)

```ts
export interface PvpStats {
  agentId: string;
  wins: number;
  losses: number;
}
```

---

## Frontend Changes

### `/battle` page (`src/app/battle/page.tsx`)

Replace the "PvP coming soon" stub with a functional PvP section above the training section. The two sections are visually separated.

**PvP section contains:**
- Single-select agent grid (same card style as training grid, but only 1 agent can be selected)
- Per-agent display: PvP fights remaining today shown separately from training fights (e.g. "PvP: 2/3")
- "Find Opponent" button (active when 1 agent selected and has PvP fights remaining)
- Loading state: "Searching..." while API call is in flight
- On success: transition to battle playback phase (reuses existing `BattlePlayback` component)
- Results screen (after playback):
  - Win / Loss indicator
  - Opponent agent name + role badge
  - Dimension growth badges for both agents (same `renderGrowth` component as training)
  - Updated PvP record: e.g. "3W / 1L"
  - "Fight Again" and "Back to Agents" buttons

**PvP fight limit:** 3 per agent per day, tracked independently. The recharge button (SOL payment) applies only to training fights and is not shown in the PvP section.

### `/rank` page (`src/app/rank/page.tsx`)

Load `levelup_pvp_stats` for all listed agents in one bulk query. Add a `W-L` column to each agent row showing `{wins}W - {losses}L`. Agents with no PvP history show `—`.

---

## Files Changed

| File | Change |
|------|--------|
| Supabase (migration) | Add `pvp` column to `levelup_battle_logs`; create `levelup_pvp_stats` table |
| `src/lib/types.ts` | Add `PvpStats` interface |
| `src/lib/db.ts` | Add `getPvpFightsToday`, `savePvpBattleLog`, `updatePvpStats`, `getPvpStatsForAgents` |
| `src/app/api/pvp/battle/route.ts` | New POST route handler |
| `src/app/battle/page.tsx` | Replace PvP stub with functional section |
| `src/app/rank/page.tsx` | Add W-L column using bulk pvp stats fetch |

---

## Out of Scope

- SOL wagering for PvP fights
- Recharge (SOL payment) for PvP fight limit
- ELO / MMR rating (wins/losses only, no weighted ranking score)
- Push notifications when someone fights your agent
- PvP fight history tab
