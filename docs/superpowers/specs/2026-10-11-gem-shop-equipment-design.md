# Gem Shop & Equipment — Design Spec

**Date:** 2026-10-11
**Status:** Approved in conversation (sections 1–2 explicitly; user then asked to implement everything; sections 3–5 decided by Claude, recorded here)
**Sub-projects:** 1. Gems + Item Shop → 2. Equipment

---

## Why / what the user asked for

Players pay SOL to buy things that upgrade their agents. Decisions from the user:

- **Power:** paid stat power with **no cap** (plus convenience and cosmetics).
- **Currency:** players buy **gems** with SOL once, then spend gems instantly (no wallet popup per item).
- **Scope:** item shop **and** equipment, built as two sub-projects on one gem wallet.

Assumptions (stated to the user, not contradicted):

- Primary goal is revenue from the ~15–30 daily core players.
- Gems are **off-chain points** in the database: not a token/NFT, not tradable, not refundable.
- Every gem-pack payment is verified on-chain server-side and can be credited once.
- Prices start low: all-time spend was 11.3 SOL across 128 payers.

**Success criteria (4 weeks after launch):** ≥ 15 players buy at least one gem pack; shop revenue ≥ 2× the previous 4 weeks of recharge + seeker revenue; no double-credit or negative balances (ledger audit sums match wallets).

---

## Section 1 — Gem economy (approved)

| Pack | Price | Gems |
|---|---|---|
| `starter` | 0.05 SOL | 50 |
| `standard` | 0.1 SOL | 110 |
| `big` | 0.25 SOL | 300 |
| `whale` | 0.5 SOL | 650 |

**Purchase flow:** client builds a transfer to the treasury with the existing `createPaymentTransaction`, wallet signs → `POST /api/shop/gems { walletAddress, packId, signature }` → server verifies on-chain (existing `verifySolPayment`: payer = wallet, destination = treasury, ≥ pack price, < 15 min old) → records the purchase (signature UNIQUE) → credits gems. Client retries verification up to 4× (3 s apart) then shows the signature for support (same as recharge).

**Wallet & ledger (service-role writes only):**

- `levelup_gem_wallets(player_id PK, balance int ≥ 0, updated_at)`
- `levelup_gem_ledger(id, player_id, delta int, reason text, ref text UNIQUE, created_at)` — `ref` makes every credit/spend idempotent (`pack:<signature>`, `buy:<clientPurchaseId>`).
- RPC `levelup_gems_apply(p_player uuid, p_delta int, p_reason text, p_ref text) RETURNS TABLE(balance int, applied boolean)`: inserts the ledger row (ON CONFLICT ref → no-op, `applied=false`, returns current balance), locks the wallet row, **raises `insufficient_gems` if the balance would go negative** (whole call rolls back). EXECUTE revoked from anon/authenticated.
- Public read of own balance via `GET /api/shop?wallet=` (server); RLS: wallets/ledger have no anon policies.

**Known limit:** request auth is the wallet address in the body (pre-existing, deferred signature auth). Someone who knows a wallet can spend that player's gems on that player's own agents; gems can never move to another player.

## Section 2 — Item catalog (approved)

| Item id | Target | Effect | Price |
|---|---|---|---|
| `elixir_physical` … `elixir_technical` (5) | agent | +3 to every dimension of that category, permanent | 30 |
| `elixir_grand` | agent | +2 to all 50 dimensions, permanent | 80 |
| `scroll_growth` | agent | daily growth ×2 for 7 days (stacks by extending) | 60 |
| `refill_training` | agent | resets today's training fights (like the 0.05 SOL recharge) | 40 |
| `refill_pvp` | agent | +3 PvP fights today | 40 |
| `ticket_squad` | player | +1 squad battle today | 30 |
| `ticket_raid` | player | +1 raid attempt today | 50 |
| `aura_<style>` (6: ember, frost, venom, storm, holy, void) | agent | permanent aura in battle/rankings/agent page | 100 |
| `namecolor_<color>` (6: gold, crimson, azure, emerald, violet, rainbow) | agent | coloured agent name | 50 |
| `title_<id>` (3: patron, dragon_slayer, whale) | player | title next to wallet on rankings & raid board | 150 |

- No caps on any item (user decision). Cosmetics of the same kind replace the previous one (one aura, one name colour per agent; one active title per player; owning a title again is a no-op error `already_owned`).
- Elixirs apply via `applyAgentGrowth` and write a growth log (`narrative: "elixir:<itemId>"`) shown as "🧪 Elixir" in the growth timeline.
- Scroll → `levelup_agent_buffs(agent_id, kind, expires_at)`; daily growth multiplies by 2 while `expires_at > now()`; buying extends `expires_at = max(now, expires_at) + 7 days`.
- Refills/tickets → `levelup_attempt_bonuses(id, player_id, agent_id NULL, mode, extra int, day date)`; daily limit = base + Σ extra for today (UTC). `refill_training` instead inserts a `levelup_fight_recharges` row (`tx_signature = 'gems:<purchaseId>'`) so the existing recharge logic resets training fights.
- Cosmetics → `levelup_agent_cosmetics(agent_id, kind ['aura','namecolor'], value, PK(agent_id, kind))`, `levelup_player_titles(player_id PK, title)`.

## Section 3 — Equipment (sub-project 2)

- Three slots per agent: **weapon**, **armor**, **relic**. Table `levelup_agent_gear(agent_id, slot, level int ≥ 1, PK(agent_id, slot))`. Level 0 = no gear (no row).
- **Uncapped levels.** Upgrading to level `N` costs `20 + 10·N` gems (level 1 = 30, level 10 = 120).
- **Effects at battle time only** (stats/rankings stay natural), applied in `toSide` when an agent carries `gear`:
  - Weapon L: `+3·L` to the agent's role category average (medieval Physical, future Technical, modern Mental).
  - Armor L: `+1·L` to all five category averages.
  - Relic L: `+2·L` speed and `+1·L` to Social average (feint chance, still clamped by `FEINT_MAX`).
  - Max HP is unchanged (HP stays derived from real dimensions).
- **Tiers** by level: 1–4 bronze, 5–9 silver, 10–19 gold, 20+ mythic. Shown as a badge per slot and as weapon tint on the sprite (tier colour overrides the weapon pixels).
- Battle loading: every place that builds a fighter (training/PvP attacker+defender, squad members, raid squad) attaches gear via one batched `getGearForAgents(ids)`.
- Upgrade: `POST /api/shop/gear { walletAddress, agentId, slot, purchaseId }` → owner check → spend `20+10·N` gems (`ref buy:<purchaseId>`) → upsert level N. Concurrent upgrades: level increment uses `UPDATE … SET level = level + 1 WHERE agent_id AND slot AND level = expected` (optimistic) after the spend; on conflict the spend is refunded via a compensating ledger row (`ref refund:<purchaseId>`).

## Section 4 — UI

- **`/shop` page:** gem balance, 4 pack cards (buy → wallet → verify), item grid grouped (Elixirs, Boosts, Refills & Tickets, Cosmetics). Agent-targeted items open an agent picker; confirmation shows cost and new balance. Success toast with the effect ("+30 Physical stats on Aleksa").
- **Equipment panel** on `/agents/[id]` (owner only): 3 slots with level, tier badge, current bonus, next-level cost, Upgrade button.
- **Gem chip** (💎 balance → `/shop`) on dashboard, battle and agent pages. Dashboard gets a "💎 Shop" button.
- Cosmetics render: aura glow ring around `PixelSprite` (CSS drop-shadow colour per style), name colour class, title chip next to wallet on rankings/raid board.
- What's-new banner: bump `RELEASE`, add "💎 Gem Shop & Gear".

## Section 5 — Errors & testing

| Error | Status |
|---|---|
| missing fields | 400 `missing_fields` |
| unknown pack/item/slot | 400 `invalid_item` |
| wallet unknown / agent not owned | 403 `not_owner` |
| payment not verified | 402 `payment_invalid` |
| signature already credited | 409 `signature_used` (client treats as success) |
| not enough gems | 402 `insufficient_gems` |
| title already owned | 409 `already_owned` |

- All writes server-side with the service-role client; demo mode uses in-memory stores (same pattern as raids/squads).
- TDD: catalog/pricing pure tests; gem wallet tests (credit idempotent, overspend rejected, concurrent spends never negative); purchase service tests per item kind; gear bonus engine tests; attempt-bonus limit tests per mode; component tests for shop and equipment panel.
- Migration `008_gem_shop.sql` (sub-project 1) and `009_equipment.sql` (sub-project 2), applied in prod before deploy.
