# Agent Battle System Design

## Goal

Add a turn-based battle system where agents fight each other to earn dimension growth. Friendly sparring between a player's own agents, with async PvP planned for later.

## Decisions

- **Scope:** Friendly sparring only (own agents vs own agents). PvP deferred.
- **Combat:** Turn-based, HP-based (fight until KO). Rounds pick random dimension categories.
- **Rewards:** Both agents earn dimension growth. Winner gets ~2x more than loser.
- **Stamina:** 3 fights per agent per day, resets at midnight UTC.
- **Architecture:** Client-side battle engine. All logic runs in browser. Works in demo mode.

## Battle Engine

### HP
- HP = sum of all 50 dimension values (typically 500–2500)

### Round Flow
1. Random dimension category chosen (Physical/Mental/Social/Spiritual/Technical)
2. Speed (dimension #8) + randomness determines who attacks first
3. Attacker damage = category average × random(0.8–1.2)
4. Defender damage reduction = defender's category average × 0.3
5. Net damage = max(damage - reduction, 1)
6. Role bonuses: medieval +10% Physical, future +10% Technical, modern +10% Mental
7. If defender alive, they counter-attack using same formula
8. Repeat until one agent hits 0 HP

### Growth Rewards (post-battle)
- Winner: +1.0–2.0 to 3 random dimensions in categories used during fight
- Loser: +0.5–1.0 to 2 random dimensions in categories used
- Dimensions updated in DB immediately after battle

### Stamina
- 3 fights per agent per day
- Tracked by counting today's battle logs for that agent
- Resets at midnight UTC

## User Flow

1. Navigate to `/battle` (new "Battle" tab in NavBar, icon: "⚔")
2. Select your agent (shows sprite, name, HP, stamina remaining)
3. Select opponent agent (another of your agents, can't pick same one)
4. Pre-battle screen: both agents side-by-side with sprites, HP bars, category comparison
5. Click "Fight!" to start
6. Battle playback: rounds animate one at a time (~1.5s delay)
   - Round header: "Round 3 — Physical"
   - Attack/counter-attack with damage numbers
   - HP bars animate down
7. Result screen: winner announced, dimension growth for both agents, "Fight Again" / "Back" buttons

## Data Model

```typescript
interface BattleLog {
  id: string;
  attackerId: string;
  defenderId: string;
  winnerId: string;
  rounds: BattleRound[];
  attackerGrowth: Record<number, number>; // dimensionId → growth amount
  defenderGrowth: Record<number, number>;
  createdAt: string;
}

interface BattleRound {
  roundNumber: number;
  category: string;
  firstAttacker: string; // agentId
  firstDamage: number;
  secondDamage: number;
  attackerHpAfter: number;
  defenderHpAfter: number;
}
```

## Demo Mode Storage
- `localBattleLogs: BattleLog[]` in db.ts (same pattern as existing stores)

## New DB Functions
- `saveBattleLog(log)` — save fight + apply dimension growth
- `getBattleLogs(agentId, limit?)` — agent's fight history
- `getAgentFightsToday(agentId)` — count for stamina check

## New Files
- `src/lib/battle-engine.ts` — pure function `resolveBattle(agentA, agentB) → BattleLog`
- `src/app/battle/page.tsx` — battle page (select → fight → results)
- `src/components/BattlePlayback.tsx` — animated round-by-round display
- `src/components/BattleHistory.tsx` — fight log list for agent detail page

## Modified Files
- `src/lib/types.ts` — add BattleLog, BattleRound types
- `src/lib/db.ts` — add battle DB functions + demo mode storage
- `src/components/NavBar.tsx` — add Battle tab
- `src/app/agents/[id]/page.tsx` — add BattleHistory section
- `src/app/guide/page.tsx` — add battle system explanation
