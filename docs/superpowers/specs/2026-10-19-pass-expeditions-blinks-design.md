# Season Pass, Expeditions, Blink Challenges — Design

**Date:** 2026-10-19
**Status:** User asked to build the top 3 of a scored list of 20 ideas and skipped design questions; every decision below is Claude's call unless marked as the user's.

## Why

Production usage (last 30 days): 12–17 daily players, 15 core players (active 7+ of 14 days), ~0 new players per day, gem shop with no spend yet, squads used by only 5 players (most core players own fewer than 3 agents), raids popular (14 raiders).

User decisions:
- The game **never pays SOL to players**. Players may pay SOL; all rewards are in-game.
- No Seeker Genesis Token features.
- Build: Season Pass, Expeditions, Blink challenges.

Goals: give core players a two-week goal and a daily return habit (Pass), reasons to open the app several times a day and to own more agents (Expeditions), and a way for players to bring in new players from X (Blinks).

Anti-goals: anything that pays SOL out; rewards so generous they make gem packs pointless; anything that makes a fight request slower or able to fail because of a pass/XP problem.

## Shared conventions (all three)

- Next.js route handlers use `respond` / `readJson` / `missingFields` from `src/lib/api-route.ts`; services return `ServiceResult` via `fail()` from `src/lib/tactical/service-common.ts`.
- Writes use the service-role client (`getWriteClient()`), with an in-memory store when Supabase is not configured (demo mode and tests), same as `src/lib/shop/*`.
- Request auth is the wallet address in the body (existing, known limit).
- Errors: `missing_fields` 400, `invalid_*` 400, `not_owner` 403, `payment_invalid` 402, `signature_used` 409, `already_claimed` 409, limits 429.
- Gems via `applyGems` with a unique `ref` (idempotent). Tickets via `addAttemptBonus`. Titles via `grantTitle`.
- Pages are mobile-first (Seeker, 360–412px wide), dark theme, `font-mono`, Tailwind, same look as `/shop` and `/raid`.
- Each feature has its own migration; apply in prod before deploying.

## 1. Season Pass

Foundation already built: `src/lib/pass/season.ts` (season calendar, XP table, `loginXp`), `src/lib/pass/xp.ts` (`awardPassXp`, `awardPassXpSafe`, `getPassXp`), migration `011_season_pass.sql` (XP + events + `levelup_pass_add_xp`), and every finished fight session awards XP (`finalizeSession`, deferred).

- **Seasons:** 14 days from Monday 2026-10-19 00:00 UTC (`seasonOf`). XP resets each season.
- **XP:** training/PvP fight 15, squad battle 30, raid attempt 50, expedition claim 25, Blink challenger 20, Blink defender 10, daily check-in `loginXp(streak)` = 50 + 10 per consecutive day, capped at 150.
- **Streak:** consecutive UTC days with a check-in, counted across seasons from `levelup_pass_events` rows with `source = 'login'` (ref `login:<playerId>:<YYYY-MM-DD>`).
- **Tiers:** 30 tiers, 250 XP each (tier N needs N × 250 XP). A daily core player earns about 500–600 XP/day, so reaches tier 30 around day 13.
- **Rewards (catalog in `src/lib/pass/rewards.ts`, pure):**
  - Free track: 3 gems per tier; every 5th tier 10 gems + 1 Raid Ticket.
  - Premium track: 12 gems per tier; every 5th tier 40 gems; tier 30 also grants the title `pass_s<season>` (label "Season N Elite").
  - Totals: free ≈ 132 gems + 6 tickets; premium 528 gems + title.
- **Premium:** 0.15 SOL, paid once per season, verified on-chain with `verifySolPayment` and memo `levelup:pass:<season>` (add `passMemo(season)` to `src/lib/payment-memos.ts`). Recorded in `levelup_pass_premium (player_id, season, tx_signature UNIQUE)`. Unlocking premium lets you claim premium rewards for tiers already reached.
- **Claiming:** a claim row `levelup_pass_claims (player_id, season, tier, track)` (PK) is inserted first, then the reward is granted. If the grant fails, the claim row is deleted so the player can retry. Gem refs are `pass:<season>:<tier>:<track>:<playerId>`. "Claim all" claims every reachable, unclaimed tier on the tracks the player owns.
- **Routes:**
  - `GET /api/pass?wallet=`: season number and end time, xp, tier, premium owned, claimed list, streak, checked in today.
  - `POST /api/pass/checkin {walletAddress}`: awards today's login XP once.
  - `POST /api/pass/claim {walletAddress, tier?, track?, all?}`.
  - `POST /api/pass/premium {walletAddress, signature}`.
- **UI:** `/pass` page with season countdown, tier/XP bar, streak, a "Claim all" button, a tier list (free | premium per tier, locked/claimable/claimed), and a premium purchase button that uses the same wallet flow as `GemPacks` (`pay(sol, memo)` then verify with retries). The dashboard checks in once per UTC day on load and links to `/pass`.

## 2. Expeditions

- An agent can be on one expedition at a time; a player can run up to 3 at once. Agents can still fight while away (no locking, so no conflicts with squads or raids).
- **Durations and rewards:** reward decided at start and stored.

  | Duration | Stat growth | Gems | Extra |
  |---|---|---|---|
  | 4h | 0.6 | 1 | – |
  | 8h | 1.2 | 3 | – |
  | 12h | 2.0 | 5 | 15% chance of a Raid Ticket |

  Growth is split over 2 random dimensions of the agent's role category (medieval Physical, future Technical, modern Mental, via `ROLE_CATEGORY`).
- **Claim:** atomic `UPDATE … SET claimed_at = now() WHERE id AND player_id AND claimed_at IS NULL AND ends_at <= now() RETURNING *`. Then grant growth (`applyAgentGrowth`), gems (ref `exp:<id>`), ticket if any, and Pass XP (`awardPassXpSafe`, source `expedition`, ref `exp:<id>`).
- **Migration** `012_expeditions.sql`: `levelup_expeditions (id, player_id, agent_id, duration_h CHECK IN (4,8,12), started_at, ends_at, claimed_at, reward jsonb)`, unique partial index on `agent_id WHERE claimed_at IS NULL`, index on `(player_id, claimed_at)`. Service-role only. The 3-at-once limit is checked before insert and re-checked after insert (the newest is cancelled on a race, as `withinLimitAfterCreate` does).
- **Routes:**
  - `GET /api/expeditions?wallet=`: active and finished-unclaimed expeditions, plus the player's agents.
  - `POST /api/expeditions/start {walletAddress, agentId, duration}`.
  - `POST /api/expeditions/claim {walletAddress, expeditionId}`.
- **UI:** `/expeditions` page with 3 slots (countdown, claim button with reward reveal) and an agent list with 4h/8h/12h buttons. Linked from the dashboard.

## 3. Blink challenges

A player shares their agent; anyone with a Solana wallet can fight it from a Blink on X or dial.to, or from the challenge page.

- **Actions endpoints** (Solana Actions spec; CORS on every response, OPTIONS handlers, `X-Action-Version` and `X-Blockchain-Ids: solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp`):
  - `GET /api/actions/challenge/[agentId]`: icon is the agent avatar PNG; title "Fight <name>"; description is role plus Total Power; one action "Fight ⚔".
  - `POST /api/actions/challenge/[agentId] {account}`: validates the account and daily limits, then returns a memo-only transaction (fee payer = account, memo `levelup:blink:<agentId>`). The challenger pays only the network fee. Action chaining: `links.next = { type: "post", href: ".../result" }`.
  - `POST /api/actions/challenge/[agentId]/result {account, signature}`: verifies on-chain that the tx is confirmed, signed by `account`, carries the memo, and is less than 15 minutes old. It records `levelup_blink_challenges` (signature UNIQUE; a replay returns the stored result), runs a full auto tactical battle, and returns a `completed` action showing win/lose, damage and rounds, plus "Play Level Up on Seeker".
  - `GET /actions.json` maps `/challenge/*` to `/api/actions/challenge/*`.
  - `GET /api/agents/[id]/avatar`: PNG from `renderAvatarPng` (cache 1 day).
- **Fighters:** the defender is the shared agent with gear. The challenger is their strongest agent if the wallet belongs to a player; otherwise a guest fighter (all stats 150, role chosen by a hash of the wallet, name "Guest"). No growth, rating or gems change; it's an exhibition fight. Pass XP goes to the challenger (if a player) and the defender's owner.
- **Limits:** 5 challenges per challenger wallet per UTC day, and 1 per (challenger wallet, agent) per UTC day. A player can't challenge their own agent.
- **Migration** `013_blink_challenges.sql`: `levelup_blink_challenges (id, agent_id, challenger_wallet, challenger_player_id NULL, tx_signature UNIQUE, winner CHECK IN ('challenger','defender'), summary jsonb, created_at)`. Public select so the challenge page can list recent results.
- **UI:**
  - `/challenge/[agentId]` page: agent card, win/loss record, recent challenges, "Fight in Blink" link (`https://dial.to/?action=solana-action:<encoded api url>`), "Share on X", "Play Level Up".
  - Owner-only "Share challenge" button on `/agents/[id]`, using the native share sheet or copy, plus an X intent.
- **Known limits:** X unfurls Blinks only for registered actions (Dialect registry), which is a user-side step after deploy; until then, dial.to links and the challenge page work.

## Testing

TDD for every service: XP idempotency and streaks; claims (tier not reached, premium track without premium, double claim, claim all, failed grant rolled back); premium payment (invalid, replay); expeditions (limits, ownership, claim too early, double claim, reward sizes); Blinks (limits, own agent, replayed signature returns the same result, guest fighter, memo/age/signer checks). Component tests for the three pages' main flows.
