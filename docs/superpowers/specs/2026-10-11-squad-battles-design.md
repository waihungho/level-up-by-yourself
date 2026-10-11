# Squad Battles 3v3 — Design Spec (Sub-project 2 of 3)

**Date:** 2026-10-11
**Status:** Draft — awaiting user review
**Depends on:** Tactical Battles (`2026-10-11-tactical-battles-design.md`): engine, sessions, service-role client

---

## Why

Core players collect agents (130+ players own ≥3, and the top collectors own 10–20), but every fight uses one agent. The rest of the collection sits idle. Squads turn the collection into strategy: who you field, in what order, and when to tag out.

**Success criteria (4 weeks after launch):**
- ≥60% of players with ≥3 agents save a squad
- ≥1 squad battle per active core player per day on average
- Squad rating spread grows (the rating table is used, not flat)

---

## Player Experience

1. **Squad screen** (`/squad`): pick 3 agents into slots **Lead / Second / Anchor**. The screen shows the active **synergy** live as you swap agents.
2. **Squad PvP** (Battle page → "Squad Battle"): matched against another player's squad near your rating. It plays out as a tactical battle where one agent per side is active at a time.
3. When the active agent is KO'd, the next one in order steps in. You win by KO-ing all three enemy agents. The cap is 24 rounds; at the cap, the higher total HP% wins and an exact tie goes to the defender.

New action on top of the tactical set: **Swap → slot N** (any living benched ally).
- A swap uses your turn. The incoming agent takes 50% damage from the enemy strike this round.
- **Tag Special:** if team Focus ≥ 3 when you swap, the incoming agent performs its role Special immediately as it enters (and the 3 Focus is spent). This is the signature squad play.

**Focus is shared** across the squad (max 5).

```
 Lead ███████░░ Bram (medieval)   ◀ active        Enemy: Nyx (future) ██████░░░
 Second ██████████ Kade (modern)                  bench: ●● 
 Anchor ██████████ Io (future)          ⚠ Nyx is charging TECHNICAL (counter: PHYSICAL)
 [Physical★] [Mental] [Social] [Spiritual] [Technical]
 [🛡 Guard] [✦ Special] [⇄ Swap ▾] [Auto ▶▶]
```

## Rules

### Synergy (squad composition)

Evaluated once at battle start and shown on the squad screen:

| Composition | Name | Effect |
|---|---|---|
| 3 different roles | **Trinity** | +10% damage, all categories |
| 2 same role + 1 other | **Pair** | +15% on the pair's role category (Physical / Technical / Mental), applied when either pair member strikes |
| 3 same role | **Legion** | +25% on the role category, −10% on all other categories |

### HP and pacing

Per-agent HP = `sum(dims) × HP_K × SQUAD_HP_FACTOR` (≈0.45), so a full 3v3 lasts about 12–18 rounds. `SQUAD_HP_FACTOR` is tuned by simulation tests.

### AI for the enemy squad and for Auto

The tactical AI policy plus two rules:
- Active agent's HP < 25% and a benched ally whose strongest category counters the player's last-used category → Swap to that ally (max once every 3 rounds).
- Team Focus ≥ 3 and a benched ally with a stronger Special for the situation → Tag Special swap. Otherwise Special in place.

### Rewards and limits

- **2 squad battles per player per day** (player-level, independent of the per-agent training/PvP limits). The recharge isn't extended in this phase.
- Every agent that fought (was active at least 1 round) gets growth: winner side `calculateGrowth(…, true)`, loser side `false`. Each amount is ×0.6, then the tactical mastery bonus applies.
- **Squad rating:** Elo, start 1000, K = 32, stored per player.

### Matchmaking

- Opponent pool: other players with a saved squad. A player with ≥3 agents but no saved squad gets an auto-squad of their top 3 agents by total dimensions, so the pool stays non-empty with a small playerbase.
- Pick at random among players within ±150 rating. Widen by 150 until ≥1 candidate is found. Exclude the opponent faced in the caller's last 3 squad battles when possible, so the same rival doesn't repeat.

---

## Architecture

Reuses the tactical session flow. The engine gains a team layer; the single-agent engine is unchanged.

| Unit | Purpose |
|---|---|
| `src/lib/tactical/squad.ts` | Pure: `createSquadBattle(squadA, squadB)`, `resolveSquadRound(state, action, rng)`, `squadAiAction`, `synergyFor(roles)`. Internally calls `resolveRound` from `engine.ts` on the two active agents, then applies team rules (KO → next, swap, tag special, shared focus). |
| `src/lib/squads.ts` (db) | `getSquad(playerId)`, `saveSquad(playerId, agentIds)`, `getOrBuildSquad(playerId)`, `findSquadOpponent(playerId, rating)`, `applySquadResult(...)` |
| `src/app/squad/page.tsx` | Squad builder: agent picker, 3 slots, live synergy badge |
| `src/components/SquadBattle.tsx` | Builds on `TacticalBattle` subcomponents (HP bar, intent banner, action grid). Adds the bench strip and the Swap menu. |
| Routes | `/api/battle/start` accepts `mode: "squad_pvp"` (no `agentId`; uses the caller's squad). `/api/battle/turn` accepts `{ type: "swap", slot: 0 \| 1 \| 2 }`. |

`SquadState` = `{ mode: "squad_pvp"; round; teams: { attacker: TeamState; defender: TeamState }; intent; manualActions; counters; rounds }`
`TeamState` = `{ playerId; members: SideState[3]; active: 0|1|2; focus; synergy; swapCooldown }`

`TacticalRound` gains `swap?: { side; from; to; tag: boolean }` and `ko?: { side; slot }`.

### Data (migration `004_squads.sql`)

```sql
CREATE TABLE levelup_squads (
  player_id  uuid PRIMARY KEY REFERENCES levelup_players(id) ON DELETE CASCADE,
  agent_ids  uuid[] NOT NULL CHECK (array_length(agent_ids, 1) = 3),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE levelup_squad_stats (
  player_id uuid PRIMARY KEY REFERENCES levelup_players(id) ON DELETE CASCADE,
  wins int NOT NULL DEFAULT 0, losses int NOT NULL DEFAULT 0, rating int NOT NULL DEFAULT 1000
);
CREATE TABLE levelup_squad_battles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attacker_player_id uuid NOT NULL REFERENCES levelup_players(id) ON DELETE CASCADE,
  defender_player_id uuid NOT NULL REFERENCES levelup_players(id) ON DELETE CASCADE,
  winner_player_id uuid NOT NULL,
  attacker_squad uuid[] NOT NULL, defender_squad uuid[] NOT NULL,
  rounds jsonb NOT NULL, rating_delta int NOT NULL, manual_actions int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX levelup_idx_squad_battles_attacker ON levelup_squad_battles(attacker_player_id, created_at DESC);
ALTER TABLE levelup_battle_sessions DROP CONSTRAINT levelup_battle_sessions_mode_check;
ALTER TABLE levelup_battle_sessions ADD CONSTRAINT levelup_battle_sessions_mode_check CHECK (mode IN ('training','pvp','squad_pvp','raid'));
-- RLS: squads/squad_stats/squad_battles SELECT for everyone (leaderboards, viewing rivals); writes via service role only.
CREATE OR REPLACE FUNCTION levelup_squad_apply_result(p_winner uuid, p_loser uuid, p_delta int) ... -- atomic upsert of W/L + rating
```

Agent ownership is validated on save. When a squad agent no longer exists (cascade), the squad is treated as unsaved and the auto-squad is used until the player re-saves.

### UI

- Nav: Squads get a sub-tab inside Battle, not a new nav item (the bottom bar is already 6 items).
- Rank page: a new "Squads" tab with rating, W-L, and the 3 sprites side by side.
- Squad builder warns when the player has fewer than 3 agents, with a "Summon" CTA.

### Error handling

Same contract as tactical (stale round 409, ownership 403). New errors: `no_squad` (409, <3 agents), `squad_limit_reached` (429), `invalid_swap` (400: KO'd or already active target).

### Testing

- `squad.test.ts`: KO → next member; swap damage halving; tag special consumes focus and fires; shared focus; synergy for all 3 compositions; 24-round cap.
- `squad-balance.test.ts`: median 12–18 rounds; Trinity vs Legion with equal totals wins 40–60% (no dominant comp).
- Route tests: auto-squad fallback, rating update math, matchmaking widening, repeat-opponent exclusion.

### Out of scope

Squad recharge purchases, defender-configured strategy, more than 3 slots, squad-vs-squad live play.
