# Level Up By Yourself — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a Solana-connected idle/collection game where players summon unique AI agents with 50 ability dimensions that grow daily.

**Architecture:** Supabase-heavy — all game logic enforced at DB level (RLS, triggers, functions). Next.js is a thin UI layer with Solana wallet login. Claude Code runs a local cron script for daily agent growth via Claude API.

**Tech Stack:** Next.js 16 + TypeScript, Tailwind CSS v4, Supabase, @solana/wallet-adapter-react, @solana/web3.js, Vitest, pnpm

**Reference projects (copy patterns from):**
- `/Users/vfire/wisers/side/feed-the-chicken` — primary reference (PWA, GameProvider, db.ts)
- `/Users/vfire/wisers/side/card-game-programming-lang` — secondary reference

---

## Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `next.config.ts`
- Create: `tsconfig.json`
- Create: `postcss.config.mjs`
- Create: `eslint.config.mjs`
- Create: `.env.local.example`
- Create: `.gitignore`
- Create: `src/app/layout.tsx`
- Create: `src/app/page.tsx`
- Create: `src/app/globals.css`
- Create: `src/test/setup.ts`
- Create: `vitest.config.ts`

**Step 1: Initialize Next.js project with pnpm**

```bash
pnpm create next-app@latest . --typescript --tailwind --eslint --app --src-dir --no-import-alias --turbopack
```

If the directory isn't empty, scaffold manually. Use the same dependency versions as feed-the-chicken:
- next: 16.1.6, react/react-dom: 19.2.3, typescript: 5.9.3
- tailwindcss: 4, @tailwindcss/postcss
- vitest: 4.0.18, @testing-library/react

**Step 2: Add path alias**

In `tsconfig.json`, add paths:
```json
{
  "compilerOptions": {
    "paths": { "@/*": ["./src/*"] }
  }
}
```

**Step 3: Create `.env.local.example`**

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
NEXT_PUBLIC_SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
NEXT_PUBLIC_SOLANA_NETWORK=mainnet-beta
```

**Step 4: Set up vitest**

Copy `vitest.config.ts` and `src/test/setup.ts` from feed-the-chicken.

**Step 5: Create minimal `src/app/page.tsx`**

```tsx
export default function Home() {
  return <div>Level Up By Yourself</div>;
}
```

**Step 6: Verify it builds**

```bash
pnpm dev
```

**Step 7: Commit**

```bash
git add -A
git commit -m "feat: scaffold Next.js project with Tailwind, Vitest, TypeScript"
```

---

## Task 2: Supabase Client Setup

**Files:**
- Create: `src/lib/supabase.ts`
- Reference: `/Users/vfire/wisers/side/feed-the-chicken/src/lib/supabase.ts`

**Step 1: Write test for Supabase client**

Create `src/lib/__tests__/supabase.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { isSupabaseConfigured, getSupabase } from "../supabase";

describe("supabase", () => {
  it("returns null when not configured", () => {
    expect(getSupabase()).toBeNull();
  });

  it("reports not configured without env vars", () => {
    expect(isSupabaseConfigured).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
pnpm vitest run src/lib/__tests__/supabase.test.ts
```
Expected: FAIL — module not found

**Step 3: Implement Supabase client**

Create `src/lib/supabase.ts` — copy the singleton pattern from feed-the-chicken:
```typescript
import { createClient, SupabaseClient } from "@supabase/supabase-js";

let _supabase: SupabaseClient | null = null;

export const isSupabaseConfigured = !!(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null;
  if (!_supabase) {
    _supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }
  return _supabase;
}
```

**Step 4: Install dependency and run test**

```bash
pnpm add @supabase/supabase-js
pnpm vitest run src/lib/__tests__/supabase.test.ts
```
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/supabase.ts src/lib/__tests__/supabase.test.ts
git commit -m "feat: add Supabase client with singleton pattern"
```

---

## Task 3: Solana Wallet Provider

**Files:**
- Create: `src/components/WalletProvider.tsx`
- Create: `src/hooks/useUnifiedWallet.tsx`
- Create: `src/lib/mobile-bridge.ts`
- Reference: `/Users/vfire/wisers/side/feed-the-chicken/src/components/WalletProvider.tsx`
- Reference: `/Users/vfire/wisers/side/feed-the-chicken/src/hooks/useUnifiedWallet.tsx`
- Reference: `/Users/vfire/wisers/side/feed-the-chicken/src/lib/mobile-bridge.ts`

**Step 1: Install Solana dependencies**

```bash
pnpm add @solana/wallet-adapter-react @solana/wallet-adapter-react-ui @solana/wallet-adapter-wallets @solana/wallet-adapter-base @solana/web3.js @solana-mobile/wallet-adapter-mobile
```

**Step 2: Create WalletProvider.tsx**

Copy from feed-the-chicken, adapting:
- PhantomWalletAdapter + SolflareWalletAdapter
- WalletError handling with rejection filtering
- Auto-connect enabled

**Step 3: Create mobile-bridge.ts**

Copy from feed-the-chicken — handles `window.__MOBILE_BRIDGE__` detection and message passing.

**Step 4: Create useUnifiedWallet.tsx**

Copy from feed-the-chicken — provides unified interface for browser + mobile wallet.

**Step 5: Wire into layout.tsx**

Update `src/app/layout.tsx` to wrap children with WalletProvider:
```tsx
<WalletProvider>
  {children}
</WalletProvider>
```

**Step 6: Verify dev server runs**

```bash
pnpm dev
```

**Step 7: Commit**

```bash
git add src/components/WalletProvider.tsx src/hooks/useUnifiedWallet.tsx src/lib/mobile-bridge.ts src/app/layout.tsx
git commit -m "feat: add Solana wallet provider with mobile bridge support"
```

---

## Task 4: Game Constants

**Files:**
- Create: `src/lib/constants.ts`
- Create: `src/lib/types.ts`

**Step 1: Write test for constants**

Create `src/lib/__tests__/constants.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { DIMENSIONS, ROLE_WEIGHTS, GROWTH_TIERS } from "../constants";

describe("constants", () => {
  it("has exactly 50 dimensions", () => {
    expect(DIMENSIONS).toHaveLength(50);
  });

  it("has 5 categories with 10 dimensions each", () => {
    const categories = ["Physical", "Mental", "Social", "Spiritual", "Technical"];
    for (const cat of categories) {
      expect(DIMENSIONS.filter((d) => d.category === cat)).toHaveLength(10);
    }
  });

  it("has weights for all 3 role categories", () => {
    expect(ROLE_WEIGHTS).toHaveProperty("future");
    expect(ROLE_WEIGHTS).toHaveProperty("modern");
    expect(ROLE_WEIGHTS).toHaveProperty("medieval");
  });

  it("has growth tiers", () => {
    expect(GROWTH_TIERS).toHaveLength(3);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
pnpm vitest run src/lib/__tests__/constants.test.ts
```

**Step 3: Create types.ts**

```typescript
export type RoleCategory = "future" | "modern" | "medieval";

export type DimensionCategory =
  | "Physical"
  | "Mental"
  | "Social"
  | "Spiritual"
  | "Technical";

export interface Dimension {
  id: number;
  name: string;
  category: DimensionCategory;
}

export interface Player {
  id: string;
  walletAddress: string;
  abilityScore: number;
  lastSummonAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Agent {
  id: string;
  playerId: string;
  name: string;
  role: RoleCategory;
  roleTitle: string;
  character: string;
  objective: string;
  spriteSeed: Record<string, unknown>;
  createdAt: string;
}

export interface AgentDimension {
  agentId: string;
  dimensionId: number;
  value: number;
}

export interface AgentWithDimensions extends Agent {
  dimensions: AgentDimension[];
}

export interface DailyTask {
  id: string;
  name: string;
  description: string;
  abilityPoints: number;
}

export interface GrowthLog {
  agentId: string;
  date: string;
  dimensionChanges: Record<number, number>;
  narrative: string;
}

export interface GrowthTier {
  minScore: number;
  maxScore: number;
  multiplier: number;
}

export type CategoryWeight = "low" | "medium" | "high";

export interface RoleWeightMap {
  Physical: CategoryWeight;
  Mental: CategoryWeight;
  Social: CategoryWeight;
  Spiritual: CategoryWeight;
  Technical: CategoryWeight;
}
```

**Step 4: Create constants.ts**

```typescript
import type { Dimension, GrowthTier, RoleWeightMap } from "./types";

export const DIMENSIONS: Dimension[] = [
  // Physical (10)
  { id: 1, name: "Strength", category: "Physical" },
  { id: 2, name: "Agility", category: "Physical" },
  { id: 3, name: "Endurance", category: "Physical" },
  { id: 4, name: "Vitality", category: "Physical" },
  { id: 5, name: "Reflexes", category: "Physical" },
  { id: 6, name: "Precision", category: "Physical" },
  { id: 7, name: "Resilience", category: "Physical" },
  { id: 8, name: "Speed", category: "Physical" },
  { id: 9, name: "Recovery", category: "Physical" },
  { id: 10, name: "Fortitude", category: "Physical" },
  // Mental (10)
  { id: 11, name: "Intelligence", category: "Mental" },
  { id: 12, name: "Wisdom", category: "Mental" },
  { id: 13, name: "Focus", category: "Mental" },
  { id: 14, name: "Memory", category: "Mental" },
  { id: 15, name: "Creativity", category: "Mental" },
  { id: 16, name: "Logic", category: "Mental" },
  { id: 17, name: "Intuition", category: "Mental" },
  { id: 18, name: "Adaptability", category: "Mental" },
  { id: 19, name: "Perception", category: "Mental" },
  { id: 20, name: "Willpower", category: "Mental" },
  // Social (10)
  { id: 21, name: "Charisma", category: "Social" },
  { id: 22, name: "Leadership", category: "Social" },
  { id: 23, name: "Empathy", category: "Social" },
  { id: 24, name: "Persuasion", category: "Social" },
  { id: 25, name: "Diplomacy", category: "Social" },
  { id: 26, name: "Intimidation", category: "Social" },
  { id: 27, name: "Teamwork", category: "Social" },
  { id: 28, name: "Deception", category: "Social" },
  { id: 29, name: "Loyalty", category: "Social" },
  { id: 30, name: "Influence", category: "Social" },
  // Spiritual (10)
  { id: 31, name: "Spirit", category: "Spiritual" },
  { id: 32, name: "Meditation", category: "Spiritual" },
  { id: 33, name: "Aura", category: "Spiritual" },
  { id: 34, name: "Prophecy", category: "Spiritual" },
  { id: 35, name: "Faith", category: "Spiritual" },
  { id: 36, name: "Harmony", category: "Spiritual" },
  { id: 37, name: "Mysticism", category: "Spiritual" },
  { id: 38, name: "Transcendence", category: "Spiritual" },
  { id: 39, name: "Connection", category: "Spiritual" },
  { id: 40, name: "Enlightenment", category: "Spiritual" },
  // Technical (10)
  { id: 41, name: "Engineering", category: "Technical" },
  { id: 42, name: "Hacking", category: "Technical" },
  { id: 43, name: "Crafting", category: "Technical" },
  { id: 44, name: "Analysis", category: "Technical" },
  { id: 45, name: "Strategy", category: "Technical" },
  { id: 46, name: "Innovation", category: "Technical" },
  { id: 47, name: "Synthesis", category: "Technical" },
  { id: 48, name: "Automation", category: "Technical" },
  { id: 49, name: "Research", category: "Technical" },
  { id: 50, name: "Optimization", category: "Technical" },
];

export const ROLE_WEIGHTS: Record<string, RoleWeightMap> = {
  future: {
    Physical: "low",
    Mental: "high",
    Social: "medium",
    Spiritual: "low",
    Technical: "high",
  },
  modern: {
    Physical: "medium",
    Mental: "high",
    Social: "high",
    Spiritual: "low",
    Technical: "medium",
  },
  medieval: {
    Physical: "high",
    Mental: "medium",
    Social: "medium",
    Spiritual: "high",
    Technical: "low",
  },
};

export const WEIGHT_VALUES = { low: 0.5, medium: 1.0, high: 1.5 };

export const BASE_DIMENSION_VALUE = 10;
export const BONUS_MIN = 5;
export const BONUS_MAX = 15;

export const GROWTH_TIERS: GrowthTier[] = [
  { minScore: 0, maxScore: 100, multiplier: 1.0 },
  { minScore: 100, maxScore: 500, multiplier: 1.5 },
  { minScore: 500, maxScore: Infinity, multiplier: 2.0 },
];

export const SUMMON_COOLDOWN_DAYS = 7;

export const DAILY_TASKS = [
  { name: "Daily Login", description: "Log in to the game", abilityPoints: 5 },
  { name: "View Agents", description: "Visit your agents page", abilityPoints: 3 },
  { name: "Check Growth", description: "View an agent's growth log", abilityPoints: 5 },
  { name: "Read Narrative", description: "Read a growth narrative", abilityPoints: 2 },
];
```

**Step 5: Run test**

```bash
pnpm vitest run src/lib/__tests__/constants.test.ts
```
Expected: PASS

**Step 6: Commit**

```bash
git add src/lib/constants.ts src/lib/types.ts src/lib/__tests__/constants.test.ts
git commit -m "feat: add game constants (50 dimensions, role weights, growth tiers) and types"
```

---

## Task 5: Supabase Database Schema

**Files:**
- Create: `supabase/migrations/001_initial_schema.sql`

**Step 1: Create migration file**

```sql
-- Enum for role categories
CREATE TYPE role_category AS ENUM ('future', 'modern', 'medieval');

-- Players table
CREATE TABLE players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT UNIQUE NOT NULL,
  ability_score INTEGER DEFAULT 0,
  last_summon_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Dimensions reference table (50 rows)
CREATE TABLE dimensions (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('Physical', 'Mental', 'Social', 'Spiritual', 'Technical'))
);

-- Agents table
CREATE TABLE agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  name TEXT UNIQUE NOT NULL,
  role role_category NOT NULL,
  role_title TEXT NOT NULL,
  character TEXT NOT NULL,
  objective TEXT NOT NULL,
  sprite_seed JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Agent dimensions (50 per agent)
CREATE TABLE agent_dimensions (
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  dimension_id INTEGER NOT NULL REFERENCES dimensions(id),
  value FLOAT NOT NULL DEFAULT 10,
  PRIMARY KEY (agent_id, dimension_id)
);

-- Daily tasks reference table
CREATE TABLE daily_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  ability_points INTEGER NOT NULL
);

-- Player task completions
CREATE TABLE player_task_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES daily_tasks(id),
  completed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(player_id, task_id, (completed_at::date))
);

-- Growth logs
CREATE TABLE growth_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  dimension_changes JSONB NOT NULL DEFAULT '{}',
  narrative TEXT,
  UNIQUE(agent_id, date)
);

-- Indexes
CREATE INDEX idx_agents_player_id ON agents(player_id);
CREATE INDEX idx_agent_dimensions_agent_id ON agent_dimensions(agent_id);
CREATE INDEX idx_growth_logs_agent_id ON growth_logs(agent_id);
CREATE INDEX idx_player_task_completions_player_date ON player_task_completions(player_id, completed_at);

-- Immutability trigger: prevent UPDATE on agent name, character, objective
CREATE OR REPLACE FUNCTION prevent_agent_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.name != NEW.name OR OLD.character != NEW.character OR OLD.objective != NEW.objective THEN
    RAISE EXCEPTION 'Cannot modify agent name, character, or objective after creation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER agent_immutability
  BEFORE UPDATE ON agents
  FOR EACH ROW
  EXECUTE FUNCTION prevent_agent_mutation();

-- Summon cooldown check function
CREATE OR REPLACE FUNCTION check_summon_cooldown(p_player_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  last_summon TIMESTAMPTZ;
BEGIN
  SELECT last_summon_at INTO last_summon FROM players WHERE id = p_player_id;
  IF last_summon IS NULL THEN RETURN TRUE; END IF;
  RETURN last_summon < NOW() - INTERVAL '7 days';
END;
$$ LANGUAGE plpgsql;

-- Summon agent RPC function
CREATE OR REPLACE FUNCTION summon_agent(
  p_player_id UUID,
  p_name TEXT,
  p_role role_category,
  p_role_title TEXT,
  p_character TEXT,
  p_objective TEXT,
  p_sprite_seed JSONB,
  p_initial_dimensions JSONB -- array of {dimension_id, value}
)
RETURNS UUID AS $$
DECLARE
  new_agent_id UUID;
  dim JSONB;
BEGIN
  -- Check cooldown
  IF NOT check_summon_cooldown(p_player_id) THEN
    RAISE EXCEPTION 'Summon cooldown not expired. Wait 7 days between summons.';
  END IF;

  -- Create agent
  INSERT INTO agents (player_id, name, role, role_title, character, objective, sprite_seed)
  VALUES (p_player_id, p_name, p_role, p_role_title, p_character, p_objective, p_sprite_seed)
  RETURNING id INTO new_agent_id;

  -- Insert dimensions
  FOR dim IN SELECT * FROM jsonb_array_elements(p_initial_dimensions)
  LOOP
    INSERT INTO agent_dimensions (agent_id, dimension_id, value)
    VALUES (new_agent_id, (dim->>'dimension_id')::INTEGER, (dim->>'value')::FLOAT);
  END LOOP;

  -- Update player last summon
  UPDATE players SET last_summon_at = NOW(), updated_at = NOW() WHERE id = p_player_id;

  RETURN new_agent_id;
END;
$$ LANGUAGE plpgsql;

-- RLS policies
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_dimensions ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_task_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE growth_logs ENABLE ROW LEVEL SECURITY;

-- Players: users can only see/update their own row
CREATE POLICY players_select ON players FOR SELECT USING (auth.uid() = id);
CREATE POLICY players_update ON players FOR UPDATE USING (auth.uid() = id);

-- Agents: users can see all agents (public collection), but only create for themselves
CREATE POLICY agents_select ON agents FOR SELECT USING (true);
CREATE POLICY agents_insert ON agents FOR INSERT WITH CHECK (auth.uid() = player_id);

-- Agent dimensions: public read
CREATE POLICY agent_dims_select ON agent_dimensions FOR SELECT USING (true);

-- Task completions: own only
CREATE POLICY task_completions_select ON player_task_completions FOR SELECT USING (auth.uid() = player_id);
CREATE POLICY task_completions_insert ON player_task_completions FOR INSERT WITH CHECK (auth.uid() = player_id);

-- Growth logs: public read
CREATE POLICY growth_logs_select ON growth_logs FOR SELECT USING (true);

-- Seed the 50 dimensions
INSERT INTO dimensions (id, name, category) VALUES
  (1, 'Strength', 'Physical'), (2, 'Agility', 'Physical'), (3, 'Endurance', 'Physical'),
  (4, 'Vitality', 'Physical'), (5, 'Reflexes', 'Physical'), (6, 'Precision', 'Physical'),
  (7, 'Resilience', 'Physical'), (8, 'Speed', 'Physical'), (9, 'Recovery', 'Physical'),
  (10, 'Fortitude', 'Physical'),
  (11, 'Intelligence', 'Mental'), (12, 'Wisdom', 'Mental'), (13, 'Focus', 'Mental'),
  (14, 'Memory', 'Mental'), (15, 'Creativity', 'Mental'), (16, 'Logic', 'Mental'),
  (17, 'Intuition', 'Mental'), (18, 'Adaptability', 'Mental'), (19, 'Perception', 'Mental'),
  (20, 'Willpower', 'Mental'),
  (21, 'Charisma', 'Social'), (22, 'Leadership', 'Social'), (23, 'Empathy', 'Social'),
  (24, 'Persuasion', 'Social'), (25, 'Diplomacy', 'Social'), (26, 'Intimidation', 'Social'),
  (27, 'Teamwork', 'Social'), (28, 'Deception', 'Social'), (29, 'Loyalty', 'Social'),
  (30, 'Influence', 'Social'),
  (31, 'Spirit', 'Spiritual'), (32, 'Meditation', 'Spiritual'), (33, 'Aura', 'Spiritual'),
  (34, 'Prophecy', 'Spiritual'), (35, 'Faith', 'Spiritual'), (36, 'Harmony', 'Spiritual'),
  (37, 'Mysticism', 'Spiritual'), (38, 'Transcendence', 'Spiritual'), (39, 'Connection', 'Spiritual'),
  (40, 'Enlightenment', 'Spiritual'),
  (41, 'Engineering', 'Technical'), (42, 'Hacking', 'Technical'), (43, 'Crafting', 'Technical'),
  (44, 'Analysis', 'Technical'), (45, 'Strategy', 'Technical'), (46, 'Innovation', 'Technical'),
  (47, 'Synthesis', 'Technical'), (48, 'Automation', 'Technical'), (49, 'Research', 'Technical'),
  (50, 'Optimization', 'Technical');

-- Seed daily tasks
INSERT INTO daily_tasks (name, description, ability_points) VALUES
  ('Daily Login', 'Log in to the game', 5),
  ('View Agents', 'Visit your agents page', 3),
  ('Check Growth', 'View an agent''s growth log', 5),
  ('Read Narrative', 'Read a growth narrative', 2);
```

**Step 2: Commit**

```bash
git add supabase/migrations/001_initial_schema.sql
git commit -m "feat: add Supabase schema with RLS, triggers, and seed data"
```

---

## Task 6: Database Layer (db.ts)

**Files:**
- Create: `src/lib/db.ts`
- Create: `src/lib/__tests__/db.test.ts`
- Reference: `/Users/vfire/wisers/side/feed-the-chicken/src/lib/db.ts`

**Step 1: Write tests for db functions**

```typescript
import { describe, it, expect } from "vitest";
import {
  getOrCreatePlayer,
  getPlayerAgents,
  getAgentWithDimensions,
  completeTask,
  getCompletedTasksToday,
  getGrowthLogs,
} from "../db";

describe("db (demo mode — no Supabase)", () => {
  it("creates a player from wallet address", async () => {
    const player = await getOrCreatePlayer("TestWalletAddress123");
    expect(player).toBeDefined();
    expect(player.walletAddress).toBe("TestWalletAddress123");
    expect(player.abilityScore).toBe(0);
  });

  it("returns empty agents for new player", async () => {
    const player = await getOrCreatePlayer("TestWallet2");
    const agents = await getPlayerAgents(player.id);
    expect(agents).toEqual([]);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
pnpm vitest run src/lib/__tests__/db.test.ts
```

**Step 3: Implement db.ts**

Follow feed-the-chicken's dual-mode pattern:
- When Supabase configured: query Supabase with row mappers (snake_case → camelCase)
- When not configured: in-memory local store for demo mode
- Functions: `getOrCreatePlayer`, `getPlayerAgents`, `getAgentWithDimensions`, `summonAgent`, `completeTask`, `getCompletedTasksToday`, `getGrowthLogs`, `getAgentGrowthLogs`
- Row mappers at bottom of file

Key functions:
```typescript
export async function getOrCreatePlayer(walletAddress: string): Promise<Player>
export async function getPlayerAgents(playerId: string): Promise<Agent[]>
export async function getAgentWithDimensions(agentId: string): Promise<AgentWithDimensions | null>
export async function summonAgent(params: SummonParams): Promise<Agent>
export async function completeTask(playerId: string, taskId: string): Promise<void>
export async function getCompletedTasksToday(playerId: string): Promise<string[]>
export async function getGrowthLogs(agentId: string, limit?: number): Promise<GrowthLog[]>
```

**Step 4: Run tests**

```bash
pnpm vitest run src/lib/__tests__/db.test.ts
```
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/db.ts src/lib/__tests__/db.test.ts
git commit -m "feat: add database layer with dual-mode (Supabase + demo)"
```

---

## Task 7: Agent Initialization Logic

**Files:**
- Create: `src/lib/agent-init.ts`
- Create: `src/lib/__tests__/agent-init.test.ts`

**Step 1: Write tests**

```typescript
import { describe, it, expect } from "vitest";
import { generateInitialDimensions, generateSpriteSeed } from "../agent-init";

describe("generateInitialDimensions", () => {
  it("returns exactly 50 dimensions", () => {
    const dims = generateInitialDimensions("medieval");
    expect(dims).toHaveLength(50);
  });

  it("all values are >= BASE (10)", () => {
    const dims = generateInitialDimensions("future");
    for (const d of dims) {
      expect(d.value).toBeGreaterThanOrEqual(10);
    }
  });

  it("medieval role has higher Physical average than Technical", () => {
    // Run multiple times to reduce randomness impact
    let physTotal = 0, techTotal = 0;
    for (let i = 0; i < 100; i++) {
      const dims = generateInitialDimensions("medieval");
      physTotal += dims.filter((d) => d.dimensionId <= 10).reduce((s, d) => s + d.value, 0);
      techTotal += dims.filter((d) => d.dimensionId >= 41).reduce((s, d) => s + d.value, 0);
    }
    expect(physTotal).toBeGreaterThan(techTotal);
  });
});

describe("generateSpriteSeed", () => {
  it("returns deterministic seed for same inputs", () => {
    const a = generateSpriteSeed("medieval", "TestAgent", "brave warrior");
    const b = generateSpriteSeed("medieval", "TestAgent", "brave warrior");
    expect(a).toEqual(b);
  });

  it("returns different seeds for different inputs", () => {
    const a = generateSpriteSeed("medieval", "AgentA", "brave");
    const b = generateSpriteSeed("future", "AgentB", "smart");
    expect(a).not.toEqual(b);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
pnpm vitest run src/lib/__tests__/agent-init.test.ts
```

**Step 3: Implement agent-init.ts**

```typescript
import { DIMENSIONS, ROLE_WEIGHTS, WEIGHT_VALUES, BASE_DIMENSION_VALUE, BONUS_MIN, BONUS_MAX } from "./constants";
import type { RoleCategory } from "./types";

export function generateInitialDimensions(role: RoleCategory): { dimensionId: number; value: number }[] {
  const weights = ROLE_WEIGHTS[role];
  return DIMENSIONS.map((dim) => {
    const weight = WEIGHT_VALUES[weights[dim.category]];
    const bonus = Math.floor(Math.random() * (BONUS_MAX - BONUS_MIN + 1) + BONUS_MIN) * weight;
    return {
      dimensionId: dim.id,
      value: Math.round((BASE_DIMENSION_VALUE + bonus) * 10) / 10,
    };
  });
}

export function generateSpriteSeed(
  role: RoleCategory,
  name: string,
  character: string
): Record<string, number> {
  // Simple deterministic hash
  const str = `${role}:${name}:${character}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  const seed = Math.abs(hash);
  return {
    bodyType: seed % 5,
    headType: (seed >> 4) % 6,
    eyeType: (seed >> 8) % 4,
    weaponType: (seed >> 12) % 8,
    auraType: (seed >> 16) % 5,
    colorSeed: seed % 360,
  };
}
```

**Step 4: Run tests**

```bash
pnpm vitest run src/lib/__tests__/agent-init.test.ts
```
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/agent-init.ts src/lib/__tests__/agent-init.test.ts
git commit -m "feat: add agent initialization logic (dimensions + sprite seed)"
```

---

## Task 8: GameProvider Context

**Files:**
- Create: `src/components/GameProvider.tsx`
- Reference: `/Users/vfire/wisers/side/feed-the-chicken/src/components/GameProvider.tsx`

**Step 1: Create GameProvider**

Follow the feed-the-chicken pattern:
```typescript
interface GameState {
  player: Player | null;
  agents: Agent[];
  loading: boolean;
  error: string | null;
  refreshPlayer: () => Promise<void>;
  refreshAgents: () => Promise<void>;
}
```

- Watch wallet connection via `useUnifiedWallet()`
- Load player data when connected (getOrCreatePlayer)
- Load agents when player loads
- Clear state on disconnect
- Provide context with refresh functions

**Step 2: Wire into layout.tsx**

```tsx
<WalletProvider>
  <GameProvider>
    {children}
  </GameProvider>
</WalletProvider>
```

**Step 3: Verify dev server runs**

```bash
pnpm dev
```

**Step 4: Commit**

```bash
git add src/components/GameProvider.tsx src/app/layout.tsx
git commit -m "feat: add GameProvider context with player + agents state"
```

---

## Task 9: Landing Page

**Files:**
- Create/Modify: `src/app/page.tsx`
- Create: `src/components/WalletConnectButton.tsx`

**Step 1: Create WalletConnectButton**

Simple button that triggers Solana wallet connect. Shows wallet address when connected, "Connect Wallet" when not.

**Step 2: Build landing page**

- Game title "Level Up By Yourself"
- Brief description of the game concept
- Connect Wallet button (prominent)
- When connected, redirect to `/dashboard`

**Step 3: Style with Tailwind**

Dark theme, pixel-art aesthetic feel. Use monospace fonts for the game feel.

**Step 4: Verify in browser**

```bash
pnpm dev
```

**Step 5: Commit**

```bash
git add src/app/page.tsx src/components/WalletConnectButton.tsx
git commit -m "feat: add landing page with wallet connect"
```

---

## Task 10: Dashboard Page

**Files:**
- Create: `src/app/dashboard/page.tsx`
- Create: `src/components/DailyTasks.tsx`
- Create: `src/components/PlayerStats.tsx`

**Step 1: Create PlayerStats component**

Shows: ability score, total agents, next summon availability (countdown timer based on `lastSummonAt`).

**Step 2: Create DailyTasks component**

- List daily tasks from constants
- Check against `getCompletedTasksToday()` to show completed/available state
- Click to complete a task → calls `completeTask()` → refreshes player
- Show points per task

**Step 3: Create dashboard page**

Layout:
- Top: PlayerStats
- Middle: DailyTasks
- Bottom: "View Agents" and "Summon New Agent" buttons (link to `/agents` and `/summon`)

**Step 4: Verify in browser**

```bash
pnpm dev
```

**Step 5: Commit**

```bash
git add src/app/dashboard/page.tsx src/components/DailyTasks.tsx src/components/PlayerStats.tsx
git commit -m "feat: add dashboard with player stats and daily tasks"
```

---

## Task 11: Summon Page

**Files:**
- Create: `src/app/summon/page.tsx`
- Create: `src/components/SummonForm.tsx`

**Step 1: Create SummonForm component**

Form fields:
- **Name** (text input, required)
- **Role Category** (3 buttons: Future / Modern / Medieval)
- **Role Title** (text input, e.g. "Shaman", "Developer")
- **Character** (textarea, max 500 chars)
- **Objective** (textarea, max 500 chars)

Validation:
- All fields required
- Check cooldown before submit (show countdown if not ready)
- Show error if name taken

On submit:
1. Generate initial dimensions via `generateInitialDimensions(role)`
2. Generate sprite seed via `generateSpriteSeed(role, name, character)`
3. Call `summonAgent(...)` from db.ts
4. Redirect to `/agents/[newAgentId]`

**Step 2: Create summon page**

- Show cooldown timer if can't summon yet
- Show SummonForm if cooldown expired
- Preview of the role category weights when selected

**Step 3: Verify in browser**

Test the full flow: fill form → submit → redirects to agent detail.

**Step 4: Commit**

```bash
git add src/app/summon/page.tsx src/components/SummonForm.tsx
git commit -m "feat: add summon page with agent creation form"
```

---

## Task 12: Agents List Page

**Files:**
- Create: `src/app/agents/page.tsx`
- Create: `src/components/AgentCard.tsx`

**Step 1: Create AgentCard component**

- Placeholder box for pixel art (will add procedural art later)
- Agent name, role title, role category badge
- Top 5 highest dimension values displayed as bars
- Link to `/agents/[id]`

**Step 2: Create agents list page**

- Grid layout of AgentCards
- Empty state: "No agents yet. Summon your first agent!"
- Link to `/summon`

**Step 3: Verify in browser**

**Step 4: Commit**

```bash
git add src/app/agents/page.tsx src/components/AgentCard.tsx
git commit -m "feat: add agents list page with agent cards"
```

---

## Task 13: Agent Detail Page

**Files:**
- Create: `src/app/agents/[id]/page.tsx`
- Create: `src/components/DimensionRadar.tsx`
- Create: `src/components/GrowthTimeline.tsx`

**Step 1: Create DimensionRadar component**

- Display 50 dimensions grouped by 5 categories
- Use a simple bar chart layout (5 sections, 10 bars each) — simpler than a radar chart for 50 dimensions
- Each bar shows dimension name + value + visual bar width
- Color-code by category

**Step 2: Create GrowthTimeline component**

- List of growth_logs for this agent, newest first
- Each entry: date, dimension changes (which went up, by how much), narrative text
- Empty state: "No growth yet. Growth happens daily!"

**Step 3: Create agent detail page**

Layout:
- Header: pixel art placeholder, name, role, role title
- Character & Objective display (immutable, shown as quotes)
- DimensionRadar
- GrowthTimeline

**Step 4: Verify in browser**

**Step 5: Commit**

```bash
git add src/app/agents/[id]/page.tsx src/components/DimensionRadar.tsx src/components/GrowthTimeline.tsx
git commit -m "feat: add agent detail page with dimension chart and growth timeline"
```

---

## Task 14: Navigation

**Files:**
- Create: `src/components/NavBar.tsx`
- Modify: `src/app/layout.tsx`

**Step 1: Create NavBar**

Bottom navigation bar (mobile-friendly):
- Dashboard (home icon)
- Agents (grid icon)
- Summon (plus icon)

Show only when wallet is connected.

**Step 2: Add to layout**

```tsx
<GameProvider>
  {children}
  <NavBar />
</GameProvider>
```

**Step 3: Commit**

```bash
git add src/components/NavBar.tsx src/app/layout.tsx
git commit -m "feat: add bottom navigation bar"
```

---

## Task 15: Procedural Pixel Art

**Files:**
- Create: `src/components/PixelSprite.tsx`
- Create: `src/lib/sprite-renderer.ts`
- Create: `src/lib/__tests__/sprite-renderer.test.ts`

**Step 1: Write tests for sprite renderer**

```typescript
import { describe, it, expect } from "vitest";
import { generateSpriteData } from "../sprite-renderer";

describe("generateSpriteData", () => {
  it("returns a 2D pixel grid", () => {
    const grid = generateSpriteData({
      bodyType: 0, headType: 0, eyeType: 0,
      weaponType: 0, auraType: 0, colorSeed: 180,
    });
    expect(grid.length).toBeGreaterThan(0);
    expect(grid[0].length).toBeGreaterThan(0);
  });

  it("is deterministic for same seed", () => {
    const seed = { bodyType: 2, headType: 3, eyeType: 1, weaponType: 4, auraType: 2, colorSeed: 90 };
    const a = generateSpriteData(seed);
    const b = generateSpriteData(seed);
    expect(a).toEqual(b);
  });
});
```

**Step 2: Run test to verify it fails**

**Step 3: Implement sprite-renderer.ts**

- Define modular pixel patterns for each part type (body, head, eyes, weapon, aura)
- Each part is a small 2D array of pixels
- Compose parts into a 32x32 or 48x48 grid
- Apply colors based on role category palette + colorSeed
- Skeleton aesthetic: thin lines (1-2px), large head, small body

**Step 4: Create PixelSprite component**

- Takes `spriteSeed` and `role` as props
- Renders to HTML5 Canvas
- Scales up with CSS (image-rendering: pixelated)

**Step 5: Run tests**

```bash
pnpm vitest run src/lib/__tests__/sprite-renderer.test.ts
```

**Step 6: Integrate into AgentCard and agent detail page**

Replace placeholder boxes with `<PixelSprite>` component.

**Step 7: Commit**

```bash
git add src/lib/sprite-renderer.ts src/lib/__tests__/sprite-renderer.test.ts src/components/PixelSprite.tsx
git commit -m "feat: add procedural pixel art sprite renderer"
```

---

## Task 16: Daily Growth Cron Script

**Files:**
- Create: `scripts/daily-growth.ts`
- Create: `scripts/__tests__/daily-growth.test.ts`

**Step 1: Write tests**

```typescript
import { describe, it, expect } from "vitest";
import { calculateGrowth, getGrowthMultiplier } from "../daily-growth";

describe("getGrowthMultiplier", () => {
  it("returns 1.0 for score 0-99", () => {
    expect(getGrowthMultiplier(0)).toBe(1.0);
    expect(getGrowthMultiplier(99)).toBe(1.0);
  });

  it("returns 1.5 for score 100-499", () => {
    expect(getGrowthMultiplier(100)).toBe(1.5);
    expect(getGrowthMultiplier(499)).toBe(1.5);
  });

  it("returns 2.0 for score 500+", () => {
    expect(getGrowthMultiplier(500)).toBe(2.0);
    expect(getGrowthMultiplier(9999)).toBe(2.0);
  });
});

describe("calculateGrowth", () => {
  it("returns changes for some dimensions", () => {
    const changes = calculateGrowth("medieval", 1.0);
    expect(Object.keys(changes).length).toBeGreaterThan(0);
    expect(Object.keys(changes).length).toBeLessThanOrEqual(50);
  });

  it("higher multiplier produces larger growth values", () => {
    let lowTotal = 0, highTotal = 0;
    for (let i = 0; i < 100; i++) {
      const low = calculateGrowth("medieval", 1.0);
      const high = calculateGrowth("medieval", 2.0);
      lowTotal += Object.values(low).reduce((s, v) => s + v, 0);
      highTotal += Object.values(high).reduce((s, v) => s + v, 0);
    }
    expect(highTotal).toBeGreaterThan(lowTotal);
  });
});
```

**Step 2: Run test to verify it fails**

**Step 3: Implement daily-growth.ts**

```typescript
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { DIMENSIONS, ROLE_WEIGHTS, WEIGHT_VALUES, GROWTH_TIERS } from "../src/lib/constants";
import type { RoleCategory } from "../src/lib/types";

// --- Pure functions (testable) ---

export function getGrowthMultiplier(abilityScore: number): number {
  for (const tier of GROWTH_TIERS) {
    if (abilityScore >= tier.minScore && abilityScore < tier.maxScore) {
      return tier.multiplier;
    }
  }
  return 1.0;
}

export function calculateGrowth(
  role: RoleCategory,
  multiplier: number
): Record<number, number> {
  const weights = ROLE_WEIGHTS[role];
  const changes: Record<number, number> = {};

  for (const dim of DIMENSIONS) {
    const weight = WEIGHT_VALUES[weights[dim.category]];
    // Each dimension has a chance to grow based on weight
    if (Math.random() < weight * 0.4) {
      const growth = (Math.random() * 2 + 0.5) * multiplier * weight;
      changes[dim.id] = Math.round(growth * 10) / 10;
    }
  }

  return changes;
}

// --- Main cron function ---

async function generateNarrative(
  client: Anthropic,
  agent: { name: string; role: string; roleTitle: string; character: string; objective: string },
  changes: Record<number, number>
): Promise<string> {
  const grownDims = Object.entries(changes)
    .map(([id, delta]) => {
      const dim = DIMENSIONS.find((d) => d.id === Number(id));
      return `${dim?.name} +${delta}`;
    })
    .join(", ");

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 150,
    messages: [
      {
        role: "user",
        content: `Write a 1-2 sentence narrative for an agent's daily growth.
Agent: ${agent.name} (${agent.roleTitle}, ${agent.role})
Character: ${agent.character}
Objective: ${agent.objective}
Today's growth: ${grownDims}
Write in third person, atmospheric, brief.`,
      },
    ],
  });

  return response.content[0].type === "text" ? response.content[0].text : "";
}

export async function runDailyGrowth() {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );
  const anthropic = new Anthropic();

  // Fetch all agents with player ability scores
  const { data: agents } = await supabase
    .from("agents")
    .select("*, players!inner(ability_score)")
    .order("player_id");

  if (!agents?.length) {
    console.log("No agents to process.");
    return;
  }

  for (const agent of agents) {
    const multiplier = getGrowthMultiplier(agent.players.ability_score);
    const changes = calculateGrowth(agent.role, multiplier);

    if (Object.keys(changes).length === 0) continue;

    // Generate narrative
    const narrative = await generateNarrative(anthropic, agent, changes);

    // Update dimensions
    for (const [dimId, delta] of Object.entries(changes)) {
      await supabase.rpc("increment_dimension", {
        p_agent_id: agent.id,
        p_dimension_id: Number(dimId),
        p_delta: delta,
      });
    }

    // Log growth
    await supabase.from("growth_logs").insert({
      agent_id: agent.id,
      date: new Date().toISOString().split("T")[0],
      dimension_changes: changes,
      narrative,
    });

    console.log(`Grew ${agent.name}: ${Object.keys(changes).length} dimensions`);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runDailyGrowth().then(() => console.log("Done")).catch(console.error);
}
```

**Step 4: Add DB function for dimension increment**

Add to migration or new migration:
```sql
CREATE OR REPLACE FUNCTION increment_dimension(
  p_agent_id UUID,
  p_dimension_id INTEGER,
  p_delta FLOAT
)
RETURNS VOID AS $$
BEGIN
  UPDATE agent_dimensions
  SET value = value + p_delta
  WHERE agent_id = p_agent_id AND dimension_id = p_dimension_id;
END;
$$ LANGUAGE plpgsql;
```

**Step 5: Install Anthropic SDK**

```bash
pnpm add @anthropic-ai/sdk
```

**Step 6: Run tests**

```bash
pnpm vitest run scripts/__tests__/daily-growth.test.ts
```

**Step 7: Commit**

```bash
git add scripts/daily-growth.ts scripts/__tests__/daily-growth.test.ts
git commit -m "feat: add daily growth cron script with Claude API narrative generation"
```

---

## Task 17: Auth Flow (Solana → Supabase)

**Files:**
- Create: `src/lib/auth.ts`
- Modify: `src/components/GameProvider.tsx`

**Step 1: Implement Solana signature auth**

```typescript
import { getSupabase } from "./supabase";
import bs58 from "bs58";

export async function signInWithSolana(
  publicKey: string,
  signMessage: (message: Uint8Array) => Promise<Uint8Array>
): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;

  const message = `Sign in to Level Up By Yourself\nWallet: ${publicKey}\nTimestamp: ${Date.now()}`;
  const encodedMessage = new TextEncoder().encode(message);
  const signature = await signMessage(encodedMessage);

  // Use Supabase custom auth or just upsert player by wallet
  // For simplicity, use wallet address as identifier
  await supabase.from("players").upsert(
    { wallet_address: publicKey },
    { onConflict: "wallet_address" }
  );
}
```

**Step 2: Wire auth into GameProvider**

On wallet connect → call auth → load player. On disconnect → clear state.

**Step 3: Install bs58**

```bash
pnpm add bs58
```

**Step 4: Commit**

```bash
git add src/lib/auth.ts src/components/GameProvider.tsx
git commit -m "feat: add Solana wallet auth flow"
```

---

## Task 18: Polish & Integration Testing

**Files:**
- Modify: various components for styling consistency
- Create: `src/lib/__tests__/integration.test.ts`

**Step 1: Write integration test**

Test the full flow in demo mode:
1. Create player
2. Summon agent (generates dimensions + sprite seed)
3. Verify agent has 50 dimensions
4. Complete a daily task
5. Verify ability score increased

**Step 2: Run all tests**

```bash
pnpm vitest run
```

**Step 3: Polish UI**

- Consistent dark theme
- Pixel-art monospace font (e.g., "Press Start 2P" from Google Fonts or system monospace)
- Responsive grid layouts
- Loading states and error boundaries

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: add integration tests and UI polish"
```

---

## Task 19: Deploy

**Step 1: Set up Supabase project**

- Create project on supabase.com
- Run migration via Supabase dashboard SQL editor
- Copy URL + anon key to `.env.local`

**Step 2: Deploy to Vercel**

```bash
pnpm vercel
```

- Set environment variables in Vercel dashboard
- Verify build succeeds

**Step 3: Test live**

- Connect wallet on live URL
- Summon an agent
- Complete daily tasks

**Step 4: Commit any deploy fixes**

```bash
git add -A
git commit -m "fix: deploy configuration"
```

---

## Summary

| Task | Description | Estimated Steps |
|------|-------------|----------------|
| 1 | Project scaffolding | 7 |
| 2 | Supabase client | 5 |
| 3 | Solana wallet provider | 7 |
| 4 | Game constants & types | 6 |
| 5 | Database schema | 2 |
| 6 | Database layer (db.ts) | 5 |
| 7 | Agent init logic | 5 |
| 8 | GameProvider context | 4 |
| 9 | Landing page | 5 |
| 10 | Dashboard page | 5 |
| 11 | Summon page | 4 |
| 12 | Agents list page | 4 |
| 13 | Agent detail page | 5 |
| 14 | Navigation | 3 |
| 15 | Procedural pixel art | 7 |
| 16 | Daily growth cron | 7 |
| 17 | Auth flow | 4 |
| 18 | Polish & integration | 4 |
| 19 | Deploy | 4 |
| **Total** | | **91 steps** |
