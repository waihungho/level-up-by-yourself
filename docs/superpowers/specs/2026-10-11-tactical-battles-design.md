# Tactical Battles — Design Spec (Sub-project 1 of 3)

**Date:** 2026-10-11
**Status:** Draft — awaiting user review
**Series:** 1. Tactical Battles → 2. Squad Battles 3v3 → 3. Weekly Boss Raids

---

## Why

Prod Supabase snapshot (2026-10-10):

| Signal | Value |
|---|---|
| Players / agents | 1,351 / 1,111 |
| Signups per month | Apr 515 → Sep 8 → Oct 2 |
| MAU | Apr 427 → Sep 42 |
| Active last 30d / last 7d | 32 / 20 (≈14 DAU) |
| Players with 30+ active days | 45 |
| Top-10% share of active days | 78% |
| Battles total | 43,264 (top 5 players: 2.8k–4.7k each; median battler: 9) |

The game is kept alive by a small core of daily grinders, and what they do every day is **battle**. But battles today are pure stat comparison with random categories: the player presses one button and watches. There are no decisions, no skill expression and no surprises. Daily tasks (login/view/check/read) are completed in lockstep, about 5.4k each, which means they're chores.

**Goal:** make the loop the core already does thousands of times *interactive*. Players read the opponent, make choices, and feel smart when a counter lands. Keep an **Auto** path so grinding stays fast.

**Audience:** the ~15–30 daily core players (user-confirmed).

**Success criteria (measured 4 weeks after launch):**
- ≥40% of battles played with at least one manual action (`manual_actions > 0`)
- Battles per active core player per day do not drop (Auto must keep grinding fast)
- Core D7 retention ≥ the pre-launch baseline
- No increase in battle-route error rate (< 1% 5xx)

---

## Player Experience

```
Round 3            You 6,120 HP  ●●●○○ Focus      Rival 4,880 HP
            ⚠ Rival is charging  SPIRITUAL  (counter: MENTAL)

 [ Physical ]  [ Mental ★counter ]  [ Social ]
 [ Spiritual ] [ Technical ]
 [ 🛡 Guard ]  [ ✦ Special (3) ]               [ Auto ▶▶ ]
```

Each round:
1. The opponent **telegraphs an intent**: a category it will strike with, or `SPECIAL`.
2. The player picks one action: **Strike (category)**, **Guard**, **Special**, or **Auto** (finish the fight with the AI playing for you).
3. The server resolves the round and returns the result. The UI animates the hits (shake, floaters, a "COUNTER!" flash) and shows the next intent.

The fight ends when one side reaches 0 HP or after **12 rounds**. At the cap, the higher HP% wins; on an exact tie, the defender wins.

---

## Combat Rules

### Category cycle (the core decision)

Each category beats the next one around the pentagon:

```
Physical → Technical → Mental → Spiritual → Social → Physical
(smash machines) (automation outthinks) (logic dispels) (spirit unites) (crowds overwhelm)
```

`beats(a, b)` is true when b follows a in the cycle.

### Actions

| Action | Effect |
|---|---|
| **Strike C** | Damage = `catAvg(C) × rand(0.85, 1.15) × DMG_K × roleBonus − catAvg_def(C) × DEF_K`, floored at 5. If C beats the opponent's intent category, it's a **counter**: ×1.5 damage, the opponent's strike this round is reduced by 50%, and +1 Focus. |
| **Guard** | Incoming damage this round −60%. +1 Focus. Deals no damage. |
| **Special** | Costs 3 Focus. Role signature (below). Can't be countered. |
| **Auto** | The server resolves all remaining rounds with the AI policy for the player. |

**Focus:** start at 0, max 5. +1 at the end of every round, +1 for Guard, +1 for a successful counter.

**Initiative:** same as today (Speed dimension + rand 0–5). The faster side hits first. If the first hit KOs, there's no counter-attack.

**Role specials** (they reuse the existing role identity):

| Role | Special | Effect |
|---|---|---|
| medieval | **Shield Bash** | Physical strike ×2.0, opponent **stunned** next round (its intent is skipped) |
| future | **Overclock** | Technical strike ×1.8 that ignores defense reduction |
| modern | **Insight** | Mental strike ×1.3, then for the next 2 rounds the player sees the opponent's true action (feints revealed) and deals +25% damage |

### Opponent intent and feints

- At round start the AI picks an intent. The weight per category is `catAvg(C)²` (agents favour their strengths). It picks `SPECIAL` when Focus ≥ 3, with 60% probability.
- **Feint:** when resolving, the opponent switches to a different category with probability `clamp(socialAvg / (socialAvg + 120), 0.05, 0.25)`. This gives the Social stat a tactical role. No hidden state is pre-committed, so the feint is rolled at resolution time.
- Against a telegraphed `SPECIAL`, Guard is the right answer. A counter-strike doesn't interrupt specials.

### AI policy (used for opponents and for Auto)

For a given side, in priority order:
1. Opponent telegraphs SPECIAL and own HP < 50% → Guard
2. Own Focus ≥ 3 → Special
3. Some category beats the opponent's intent → strike with the strongest such category
4. Otherwise → strike with the own strongest category

The policy is deterministic given state + RNG, so it's testable.

### Balance targets (enforced by simulation tests)

- Equal-stat agents, both on AI policy: median 6–10 rounds; win rate 45–55%
- Equal stats, "optimal counter" scripted player vs AI: win rate 65–80%. Skill matters, but stats still matter.
- A 20% stat advantage vs an optimal-play underdog: the stronger side still wins ≥55%
- HP: `HP = sum(dims) × HP_K`. `HP_K`, `DMG_K` and `DEF_K` live in `src/lib/tactical/constants.ts` and are tuned until the simulation tests pass.

### Rewards

- Growth reuses the existing `calculateGrowth(categoriesUsed, isWinner)`.
- **Mastery bonus:** if the player made ≥1 manual action, growth amounts are multiplied by `1 + 0.1 × counters` (capped at ×1.5). Auto-only battles get base growth. This rewards playing without punishing grinding.
- Daily limits are unchanged: 3 training and 3 PvP fights per agent per day, plus the 0.05 SOL recharge.

---

## Architecture

### Server-authoritative sessions

Battles become multi-request, so the server keeps the state. Clients never compute outcomes. This also closes today's hole where training battles are resolved client-side and written with the anon key.

```
Client                        Next.js route                       Supabase (service role)
  │ POST /api/battle/start ─────▶ verify owner, limits ───────────▶ insert session
  │◀──── {sessionId, publicState, attacker, defender}
  │ POST /api/battle/turn ──────▶ load session, resolveRound ─────▶ update session (version check)
  │◀──── {round, publicState, finished, battleLog?}
  │        (on finish) ─────────▶ save battle_log, growth, pvp stats, mark session finished
```

### Units

| Unit | Purpose | Depends on |
|---|---|---|
| `src/lib/tactical/engine.ts` | Pure functions: `createBattle(attacker, defender, mode)`, `chooseIntent(state, side, rng)`, `resolveRound(state, action, rng)`, `aiAction(state, side, rng)`, `isFinished(state)`, `toBattleLog(state)`. No I/O. RNG injected. | types, constants |
| `src/lib/tactical/constants.ts` | Cycle, tuning constants, specials table | — |
| `src/lib/tactical/types.ts` | `TacticalState`, `Action`, `Intent`, `TacticalRound`, `PublicState` | — |
| `src/lib/tactical/session-store.ts` | `SessionStore` interface + `SupabaseSessionStore` + `MemorySessionStore` (demo mode and tests) | supabase-admin |
| `src/lib/supabase-admin.ts` | Server-only client using `SUPABASE_SERVICE_ROLE_KEY` (`import "server-only"`) | env |
| `src/app/api/battle/start/route.ts` | Validate, enforce limits, auto-resolve stale sessions, create session | engine, store, db |
| `src/app/api/battle/turn/route.ts` | Apply one action (or Auto), persist, finalise | engine, store, db |
| `src/components/TacticalBattle.tsx` | Battle UI: sprites, HP/Focus, intent banner, action grid, round log, Auto | PixelSprite |
| `src/components/CounterWheel.tsx` | Small SVG pentagon of the cycle, highlighting the current counter | — |

`TacticalState` (stored as jsonb):
```ts
{
  mode: "training" | "pvp";
  round: number;                 // completed rounds; also the optimistic version
  sides: { attacker: SideState; defender: SideState };
  intent: Intent;                // defender's telegraphed intent for the next round
  manualActions: number;
  counters: number;
  rounds: TacticalRound[];
}
SideState = { agentId; role; hp; maxHp; focus; stunned: boolean; insightRounds: number; catAvg: Record<Category, number>; speed: number; socialAvg: number }
```
`catAvg` is snapshotted at start so growth during the fight can't affect it, and each turn needs no extra DB reads.

`PublicState` is the full `TacticalState`. Nothing in it is secret, because feints are rolled at resolution time. The defender (AI) always executes its telegraphed intent, subject to feint and stun.

### API

**`POST /api/battle/start`**
```ts
// request
{ mode: "training" | "pvp"; agentId: string; walletAddress: string; opponentAgentId?: string /* training: own second agent */ }
// 200
{ sessionId: string; state: PublicState; attacker: AgentWithDimensions; defender: AgentWithDimensions }
// errors: 400 missing_fields | 403 not_owner | 429 fight_limit_reached | 409 no_opponent | 500 internal
```
- Training: both agents must belong to the caller and both must have fights left. Each consumes 1 training fight (same as today).
- PvP: random opponent from other players (same as the current `/api/pvp/battle`). Consumes 1 PvP fight.
- **Stale sessions:** an `active` session for the same agent is first auto-resolved with the AI policy and finalised, then the new one starts. The fight was already counted at start, so abandoning a fight can't refund it.

**`POST /api/battle/turn`**
```ts
// request
{ sessionId: string; walletAddress: string; round: number; action: { type: "strike"; category: Category } | { type: "guard" } | { type: "special" } | { type: "auto" } }
// 200
{ rounds: TacticalRound[] /* 1, or all remaining for auto */; state: PublicState; finished: boolean; battleLog?: BattleLog; growth?: { attacker: Record<number, number>; defender: Record<number, number> } }
// errors: 400 invalid_action (e.g. special with focus < 3) | 403 not_owner | 404 no_session | 409 stale_round | 410 session_finished
```
- `round` must equal `state.round`. Otherwise 409 (double-tap or retry). The update uses `... where id = $1 and (state->>'round')::int = $2`, so concurrent duplicate requests can't both apply.
- On finish: write `levelup_battle_logs` (`pvp` flag as today, rounds = `TacticalRound[]`), apply growth through the existing increment path, update `levelup_pvp_stats` for PvP, and set the session to `finished`. All of this runs from the service-role client.

### Data changes (migration `003_tactical_battles.sql`)

```sql
CREATE TABLE levelup_battle_sessions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mode        text NOT NULL CHECK (mode IN ('training','pvp')),
  player_id   uuid NOT NULL REFERENCES levelup_players(id) ON DELETE CASCADE,
  attacker_id uuid NOT NULL REFERENCES levelup_agents(id) ON DELETE CASCADE,
  defender_id uuid REFERENCES levelup_agents(id) ON DELETE CASCADE,
  state       jsonb NOT NULL,
  status      text NOT NULL DEFAULT 'active' CHECK (status IN ('active','finished')),
  battle_log_id uuid REFERENCES levelup_battle_logs(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX levelup_idx_sessions_attacker_active ON levelup_battle_sessions(attacker_id) WHERE status = 'active';
ALTER TABLE levelup_battle_sessions ENABLE ROW LEVEL SECURITY;  -- no anon policies: service role only

ALTER TABLE levelup_battle_logs ADD COLUMN IF NOT EXISTS tactical boolean NOT NULL DEFAULT false;
ALTER TABLE levelup_battle_logs ADD COLUMN IF NOT EXISTS manual_actions int NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS levelup_idx_battle_logs_created ON levelup_battle_logs(created_at DESC);
```
The new `created_at` index also fixes the statement timeout seen when ordering battle logs by date.

Fight counting: a fight is consumed when a session is created. The existing `getAgentFightsToday` / `getPvpFightsToday` count battle logs, so `start` also counts today's `active` sessions for the agent, giving `logs today + active sessions today`.

`BattleRound` (types.ts) gains optional fields so old logs still render in `BattleHistory` / `BattlePlayback`:
```ts
playerAction?: "strike" | "guard" | "special";
actionCategory?: string; opponentIntent?: string; countered?: boolean; feint?: boolean; special?: string;
```

New env: `SUPABASE_SERVICE_ROLE_KEY` (Vercel, production + preview, sensitive, server-only).

### UI changes

- `/battle` page: the Training and PvP "Fight" buttons call `/api/battle/start` and render `<TacticalBattle>` instead of `<BattlePlayback>`. `BattlePlayback` stays for viewing history.
- `TacticalBattle`: mobile-first (this ships inside the Android WebView). Two-column action grid. Thumb-reachable buttons ≥ 44px. The counter option gets a ★ highlight only after the player has seen the tutorial (we teach first, then assist). Round animations finish in ≤ 900ms so manual play feels snappy. Auto streams the returned rounds at 2× speed with a Skip button.
- First-battle tutorial: a 3-step overlay (intent → counter wheel → focus/special). Seen-state goes in `localStorage` (try/catch, so it's a convenience only).
- Result screen: the existing growth chips, plus "Counters: 3 → +30% growth" when the mastery bonus applied.

### Error handling

- Network failure on a turn: the client retries with the same `round`. The server returns 409 `stale_round` if the turn was already applied, and the client then refetches the state with `GET /api/battle/session/:id` (returns `PublicState` only if the caller owns it).
- Engine invariants (HP ≥ 0, focus within 0–5, round ≤ 12) are asserted in `resolveRound`. A violation throws, the route returns 500 and logs `[battle/turn]` with the session id.
- Demo mode (no Supabase): `MemorySessionStore` keeps the feature fully playable locally.

### Testing

- `engine.test.ts`: the cycle; counter math; guard; each special; stun skipping intent; insight; focus caps; 12-round cap and tiebreak; feint probability bounds. Uses a seeded RNG helper (`mulberry32`).
- `balance.test.ts`: 2,000-fight simulations asserting the balance targets above.
- `battle-routes.test.ts` (MemorySessionStore + demo db): ownership, limits, stale-session auto-resolve, `round` mismatch → 409, invalid special → 400, Auto finishes, finalisation writes the log once.
- Manual QA on a Seeker or Android device in the WebView: a full manual fight, an Auto fight, a mid-fight app kill and resume.

### Out of scope (YAGNI)

Defender-configurable PvP tactics, equipment/items, real-time human vs human, and wallet-signature auth. Request auth stays the same as the existing PvP route (wallet address in the body); that's a known limitation to harden separately.
