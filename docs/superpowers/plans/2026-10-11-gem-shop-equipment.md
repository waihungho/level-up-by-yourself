# Gem Shop & Equipment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Players buy gems with SOL (verified on-chain) and spend them on uncapped stat Elixirs, boosts, refills, cosmetics (Part A) and uncapped agent equipment (Part B).

**Architecture:** Pure catalog module (`src/lib/shop/catalog.ts`) defines packs, items, gear costs and tiers. A gem wallet module (`gems.ts`) wraps an atomic, idempotent ledger RPC (memory store in demo/tests). `shop-db.ts` stores item effects (buffs, attempt bonuses, cosmetics, titles); `gear-db.ts` stores equipment. `shop-service.ts` / `gear-service.ts` hold request logic behind thin routes. Battle limits read attempt bonuses; `toSide` applies gear bonuses.

**Tech Stack:** Next.js 16 route handlers, React 19, TypeScript, Supabase (service-role writes, anon reads), Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-11-gem-shop-equipment-design.md`

## Global Constraints

- Packs: starter 0.05 SOL → 50, standard 0.1 → 110, big 0.25 → 300, whale 0.5 → 650 gems.
- Item prices (gems): category elixir 30 (+3 to each dim in category), grand elixir 80 (+2 all dims), scroll 60 (×2 growth 7 days, extends), refill_training 40, refill_pvp 40 (+3), ticket_squad 30 (+1), ticket_raid 50 (+1), aura 100, namecolor 50, title 150.
- Gear: slots weapon/armor/relic; upgrade to level N costs `20 + 10·N`; weapon `+3·L` role category, armor `+1·L` all categories, relic `+2·L` speed and `+1·L` Social; tiers 1–4 bronze, 5–9 silver, 10–19 gold, 20+ mythic. No caps anywhere.
- Gem balance can never go negative; every credit/spend has a unique `ref`.
- Errors: `missing_fields` 400, `invalid_item` 400, `not_owner` 403, `payment_invalid` 402, `signature_used` 409, `insufficient_gems` 402, `already_owned` 409.

## Review Focus

- Two taps buying the same item with one purchaseId → charged once (A2/A4 tests).
- Two different purchases racing on a balance that covers only one → exactly one succeeds, balance ≥ 0 (A2 test).
- Gem pack payment credited, client retries with same signature → 409 treated as success, no double credit (A4 test).
- Squad/raid/PvP limits respect today's tickets and ignore yesterday's (A3 tests).
- Gear upgrade race on the same slot → one level per paid upgrade, loser refunded (B3 test).

---

## Part A — Gems + Item Shop

### Task A1: Catalog
**Files:** `src/lib/shop/catalog.ts`, test `src/lib/shop/__tests__/catalog.test.ts`
**Produces:** `GEM_PACKS: Record<PackId, {sol: number; gems: number; label: string}>`, `ShopItem {id; name; kind: 'elixir'|'scroll'|'refill'|'ticket'|'aura'|'namecolor'|'title'; target: 'agent'|'player'; price; description; category?; mode?; extra?; value?}`, `SHOP_ITEMS: ShopItem[]`, `getItem(id)`, `elixirGrowth(item): Record<number, number>`, `gearUpgradeCost(nextLevel)`, `gearTier(level)`, `GEAR_SLOTS`, `gearBonus(role, gear)`.
- [ ] test → fail → implement → pass → commit.

### Task A2: Gem wallet + migration 008
**Files:** `supabase/migrations/008_gem_shop.sql` (wallets, ledger, gem purchases, agent buffs, attempt bonuses, cosmetics, titles, `levelup_gems_apply`), `src/lib/shop/gems.ts`, test `gems.test.ts`
**Produces:** `getGemBalance(playerId)`, `applyGems({playerId, delta, reason, ref}) → {balance, applied}` (throws `InsufficientGemsError`), `resetShopMemory()`.
- [ ] tests: credit idempotent by ref; spend below zero throws and leaves balance; concurrent spends never negative → implement → commit.

### Task A3: Item effects + limits
**Files:** `src/lib/shop/shop-db.ts`; modify `battle-service.ts`, `squad-service.ts`, `raid-service.ts`, `src/scripts/daily-growth.ts`; test `shop-db.test.ts`, limit tests in existing service tests.
**Produces:** `extendGrowthBuff(agentId, days)`, `getActiveGrowthBuffs(agentIds)`, `addAttemptBonus({playerId, agentId?, mode, extra})`, `getAttemptBonusToday({playerId?, agentId?, mode})`, `setCosmetic(agentId, kind, value)`, `getCosmetics(agentIds)`, `grantTitle(playerId, title)` (throws `AlreadyOwnedError`), `getTitles(playerIds)`.
- [ ] tests → implement → limits = base + bonus → scroll doubles growth multiplier → commit.

### Task A4: Shop service
**Files:** `src/lib/shop/shop-service.ts`, test `shop-service.test.ts`
**Produces:** `buyGemPack({walletAddress, packId, signature}, {verify})`, `buyItem({walletAddress, itemId, agentId?, purchaseId})`, `getShopView({walletAddress})`.
- [ ] tests per item kind + errors + idempotency → implement → commit.

### Task A5: Routes
`/api/shop` GET, `/api/shop/gems` POST, `/api/shop/buy` POST via `respond()`/`readJson()`. Build passes. Commit.

### Task A6: Shop UI + cosmetics rendering
`/shop` page, `GemChip`, `useGems` hook, aura ring in sprite wrapper (`AgentAvatar`), name colour + title display on rankings, growth timeline elixir label, dashboard Shop button, what's-new bump. Component tests for shop purchase flow and agent picker. Commit.

## Part B — Equipment

### Task B1: Gear storage + migration 009
`supabase/migrations/009_equipment.sql` (`levelup_agent_gear`, `levelup_gear_upgrade` RPC with optimistic level), `src/lib/shop/gear-db.ts`: `getGearForAgents(ids) → Record<agentId, Gear>`, `upgradeGearLevel(agentId, slot, expectedLevel) → boolean`. Tests. Commit.

### Task B2: Gear in battle
`AgentWithDimensions.gear?`; `toSide` applies `gearBonus`; battle/squad/raid starts attach gear via `withGear(agents)`. Engine tests (bonus values, HP unchanged), service test (gear changes catAvg). Balance tests stay green. Commit.

### Task B3: Gear service + route
`src/lib/shop/gear-service.ts` `upgradeGear({walletAddress, agentId, slot, purchaseId})`; route `/api/shop/gear`. Tests: cost by level, insufficient gems, race refunds. Commit.

### Task B4: Equipment UI
`EquipmentPanel` on `/agents/[id]` (owner), tier badges, sprite weapon tint. Component test. Commit.

### Task C: Docs, migrations in prod, reviews
CLAUDE.md, apply 008+009 in prod SQL editor, code-review-react-typescript + codex review, fix all, deploy.
