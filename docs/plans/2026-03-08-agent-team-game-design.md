# Level Up By Yourself — Game Design Doc

## Overview

A Solana-connected idle/collection game where players build teams of unique AI agents. Each agent has a role, character, objective, and 50 ability dimensions that grow daily based on player activity. Agents are procedurally generated with pixel/skeleton-style art.

## Tech Stack

- **Framework:** Next.js (latest) + TypeScript
- **Styling:** Tailwind CSS v4
- **Database/Auth:** Supabase (Postgres + RLS + DB functions)
- **Blockchain:** @solana/wallet-adapter-react + @solana/web3.js (wallet login only)
- **Testing:** Vitest
- **Package Manager:** pnpm
- **Deploy:** Vercel (frontend) + Supabase (backend)
- **Daily Growth Cron:** Claude Code (local) reads Supabase, calls Claude API, writes growth back

## Architecture

```
Next.js (Vercel)  ──▶  Supabase (Postgres + Auth + RLS)  ◀──  Claude Code (local cron)
```

- **Supabase-heavy approach:** All game logic enforced at DB level (RLS, triggers, functions)
- **Next.js:** Thin UI layer, Solana wallet connect, pages
- **Claude Code:** Daily cron job for agent growth (LLM narrative + weighted random)

## Core Gameplay

- **Collection & growth** — the game IS the collecting, growing, and comparing agents
- Players complete daily in-game tasks to build ability score
- Higher ability score = faster agent growth
- One new agent summon per week
- Agents grow autonomously via daily system run

## Data Model

### players
| Column | Type | Notes |
|--------|------|-------|
| id | uuid (PK) | |
| wallet_address | text (unique) | Solana pubkey |
| ability_score | integer | Accumulated from daily tasks |
| last_summon_at | timestamptz | Enforces 1 summon/week |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### agents
| Column | Type | Notes |
|--------|------|-------|
| id | uuid (PK) | |
| player_id | FK → players | |
| name | text (unique) | Immutable after creation |
| role | enum (future/modern/medieval) | |
| role_title | text | e.g. "Shaman", "Developer", "AI Brain" |
| character | text | Player-written, immutable |
| objective | text | Player-written, immutable |
| sprite_seed | jsonb | Deterministic data for procedural art |
| created_at | timestamptz | |

### dimensions (reference table, 50 rows)
| Column | Type | Notes |
|--------|------|-------|
| id | integer (PK) | |
| name | text | e.g. "Strength", "Intelligence" |
| category | text | Physical, Mental, Social, Spiritual, Technical |

### agent_dimensions
| Column | Type | Notes |
|--------|------|-------|
| agent_id | FK → agents | |
| dimension_id | FK → dimensions | |
| value | float | Default based on role |
| PK: (agent_id, dimension_id) | | |

### daily_tasks
| Column | Type | Notes |
|--------|------|-------|
| id | uuid (PK) | |
| name | text | |
| description | text | |
| ability_points | integer | Points granted on completion |

### player_task_completions
| Column | Type | Notes |
|--------|------|-------|
| player_id | FK → players | |
| task_id | FK → daily_tasks | |
| completed_at | timestamptz | |

### growth_logs
| Column | Type | Notes |
|--------|------|-------|
| agent_id | FK → agents | |
| date | date | |
| dimension_changes | jsonb | Map of dimension_id → delta |
| narrative | text | AI-generated growth story |

### DB Constraints
- **Immutability:** Trigger on `agents` prevents UPDATE on `name`, `character`, `objective`
- **Summon cooldown:** DB function checks `last_summon_at >= now() - interval '7 days'`
- **Name uniqueness:** Unique constraint on `agents.name`

## The 50 Dimensions

### Physical (10)
Strength, Agility, Endurance, Vitality, Reflexes, Precision, Resilience, Speed, Recovery, Fortitude

### Mental (10)
Intelligence, Wisdom, Focus, Memory, Creativity, Logic, Intuition, Adaptability, Perception, Willpower

### Social (10)
Charisma, Leadership, Empathy, Persuasion, Diplomacy, Intimidation, Teamwork, Deception, Loyalty, Influence

### Spiritual (10)
Spirit, Meditation, Aura, Prophecy, Faith, Harmony, Mysticism, Transcendence, Connection, Enlightenment

### Technical (10)
Engineering, Hacking, Crafting, Analysis, Strategy, Innovation, Synthesis, Automation, Research, Optimization

### Role Weight Distribution (initial values + growth probability)

| Category | Future | Modern | Medieval |
|----------|--------|--------|----------|
| Physical | Low | Medium | High |
| Mental | High | High | Medium |
| Social | Medium | High | Medium |
| Spiritual | Low | Low | High |
| Technical | High | Medium | Low |

Initial values: base 10 per dimension, +5 to +15 bonus randomly distributed across weighted-high categories.

## Game Mechanics

### Player Ability
- Complete daily tasks (log in, view agents, check growth) to earn ability points
- `ability_score` accumulates, never resets
- Growth multiplier tiers: 0-100 = 1x, 100-500 = 1.5x, 500+ = 2x

### Agent Summoning
1. Player fills form: name, role category, role title, character, objective
2. System validates name uniqueness + 7-day cooldown
3. 50 dimensions initialized with role-weighted base values
4. `sprite_seed` generated from hash of role + name + character

### Daily Growth (Claude Code cron)
1. Fetch all agents with their player's ability_score
2. For each agent:
   - Weighted random picks which dimensions grow (role influences probabilities)
   - Player ability_score determines growth magnitude
   - Claude API generates a short narrative for the growth
3. Apply dimension changes, write to `growth_logs`
4. Batch agents per player to minimize API calls

## Frontend

### Pages
| Route | Purpose |
|-------|---------|
| `/` | Landing — connect wallet, game intro |
| `/dashboard` | Player overview — ability score, daily tasks, agent count |
| `/agents` | Agent team grid — pixel art, quick stats |
| `/agents/[id]` | Agent detail — radar chart, growth timeline, narrative |
| `/summon` | Create agent — role picker, form, cooldown timer |

### Key Components
- **WalletConnect** — Solana wallet adapter
- **AgentCard** — pixel sprite + name + role + top 5 stats
- **DimensionRadar** — radar/spider chart (50 dimensions grouped by category)
- **GrowthTimeline** — daily log with AI narratives
- **DailyTasks** — task checklist with completion state
- **SummonForm** — role selector, inputs, cooldown display

### Procedural Pixel Art
- Canvas-based rendering
- Modular parts: body, head, eyes, weapon/tool, aura
- Parts selected deterministically from `sprite_seed`
- Color palette by role: future = neon/cyber, modern = muted, medieval = earth tones
- Skeleton aesthetic: thin limbs, exaggerated heads, minimal detail

### Auth Flow
1. Connect Solana wallet
2. Sign message → verify server-side
3. Supabase custom auth issues JWT
4. RLS policies scope all queries to player

## Monetization (Future)
- Free to play + premium features
- Extra summon slots (more than 1/week)
- Growth boost (temporary multiplier)
- Cosmetic sprite accessories
