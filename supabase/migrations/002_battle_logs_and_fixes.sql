-- =============================================
-- Migration 002: Battle logs, RLS fixes, RPC fixes
-- =============================================

-- Battle Logs table
CREATE TABLE levelup_battle_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attacker_id UUID NOT NULL REFERENCES levelup_agents(id) ON DELETE CASCADE,
  defender_id UUID NOT NULL REFERENCES levelup_agents(id) ON DELETE CASCADE,
  winner_id UUID NOT NULL REFERENCES levelup_agents(id) ON DELETE CASCADE,
  rounds JSONB NOT NULL DEFAULT '[]',
  attacker_growth JSONB NOT NULL DEFAULT '{}',
  defender_growth JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_levelup_battle_logs_attacker ON levelup_battle_logs(attacker_id, created_at DESC);
CREATE INDEX idx_levelup_battle_logs_defender ON levelup_battle_logs(defender_id, created_at DESC);

-- RLS for battle logs
ALTER TABLE levelup_battle_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY levelup_battle_logs_select ON levelup_battle_logs FOR SELECT USING (true);
CREATE POLICY levelup_battle_logs_insert ON levelup_battle_logs FOR INSERT WITH CHECK (true);

-- =============================================
-- Fix RLS: allow anon key inserts/reads for demo app
-- (The original migration used auth.uid() which requires Supabase Auth.
--  Since we use wallet-based login via anon key, open up policies.)
-- =============================================

-- Drop restrictive policies
DROP POLICY IF EXISTS levelup_players_select ON levelup_players;
DROP POLICY IF EXISTS levelup_players_update ON levelup_players;
DROP POLICY IF EXISTS levelup_agents_insert ON levelup_agents;
DROP POLICY IF EXISTS levelup_task_completions_select ON levelup_player_task_completions;
DROP POLICY IF EXISTS levelup_task_completions_insert ON levelup_player_task_completions;

-- Re-create with open access (anon key)
CREATE POLICY levelup_players_select ON levelup_players FOR SELECT USING (true);
CREATE POLICY levelup_players_insert ON levelup_players FOR INSERT WITH CHECK (true);
CREATE POLICY levelup_players_update ON levelup_players FOR UPDATE USING (true);

CREATE POLICY levelup_agents_insert ON levelup_agents FOR INSERT WITH CHECK (true);

CREATE POLICY levelup_agent_dims_insert ON levelup_agent_dimensions FOR INSERT WITH CHECK (true);
CREATE POLICY levelup_agent_dims_update ON levelup_agent_dimensions FOR UPDATE USING (true);

CREATE POLICY levelup_task_completions_select ON levelup_player_task_completions FOR SELECT USING (true);
CREATE POLICY levelup_task_completions_insert ON levelup_player_task_completions FOR INSERT WITH CHECK (true);

CREATE POLICY levelup_growth_logs_insert ON levelup_growth_logs FOR INSERT WITH CHECK (true);

-- =============================================
-- Fix summon RPC: return full row (SETOF) instead of just UUID
-- Also fix task_completions to use task_name instead of task_id
-- =============================================

-- Drop old summon function
DROP FUNCTION IF EXISTS levelup_summon_agent(UUID, TEXT, levelup_role_category, TEXT, TEXT, TEXT, JSONB, JSONB);

-- Recreated: returns full agent row
CREATE OR REPLACE FUNCTION levelup_summon_agent(
  p_player_id UUID,
  p_name TEXT,
  p_role levelup_role_category,
  p_role_title TEXT,
  p_character TEXT,
  p_objective TEXT,
  p_sprite_seed JSONB,
  p_initial_dimensions JSONB
)
RETURNS SETOF levelup_agents
LANGUAGE plpgsql
AS $$
DECLARE
  new_agent_id UUID;
  dim JSONB;
BEGIN
  IF NOT levelup_check_summon_cooldown(p_player_id) THEN
    RAISE EXCEPTION 'Summon cooldown not expired. Wait 7 days between summons.';
  END IF;

  INSERT INTO levelup_agents (player_id, name, role, role_title, character, objective, sprite_seed)
  VALUES (p_player_id, p_name, p_role, p_role_title, p_character, p_objective, p_sprite_seed)
  RETURNING id INTO new_agent_id;

  FOR dim IN SELECT * FROM jsonb_array_elements(p_initial_dimensions)
  LOOP
    INSERT INTO levelup_agent_dimensions (agent_id, dimension_id, value)
    VALUES (new_agent_id, (dim->>'dimension_id')::INTEGER, (dim->>'value')::FLOAT);
  END LOOP;

  UPDATE levelup_players SET last_summon_at = NOW(), updated_at = NOW() WHERE id = p_player_id;

  RETURN QUERY SELECT * FROM levelup_agents WHERE id = new_agent_id;
END;
$$;

-- Update summon cooldown to 7 days
CREATE OR REPLACE FUNCTION levelup_check_summon_cooldown(p_player_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  last_summon TIMESTAMPTZ;
BEGIN
  SELECT last_summon_at INTO last_summon FROM levelup_players WHERE id = p_player_id;
  IF last_summon IS NULL THEN RETURN TRUE; END IF;
  RETURN last_summon < NOW() - INTERVAL '7 days';
END;
$$ LANGUAGE plpgsql;

-- Increment ability score RPC
CREATE OR REPLACE FUNCTION increment_ability_score(
  p_player_id UUID,
  p_points INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE levelup_players
  SET ability_score = ability_score + p_points, updated_at = NOW()
  WHERE id = p_player_id;
END;
$$;

-- =============================================
-- Fix task_completions: add task_name column
-- (The app uses task_name, not task_id FK)
-- =============================================

-- Add task_name column if the table only has task_id
ALTER TABLE levelup_player_task_completions
  ADD COLUMN IF NOT EXISTS task_name TEXT;

-- Rename completed_at to created_at to match app expectations
ALTER TABLE levelup_player_task_completions
  RENAME COLUMN completed_at TO created_at;

-- Add created_at index for date filtering
CREATE INDEX IF NOT EXISTS idx_levelup_task_completions_created
  ON levelup_player_task_completions(player_id, created_at DESC);

-- Remove agent name uniqueness (multiple players can have same agent name)
ALTER TABLE levelup_agents DROP CONSTRAINT IF EXISTS levelup_agents_name_key;

-- =============================================
-- Seeker Tasks table
-- =============================================

CREATE TABLE levelup_seeker_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES levelup_players(id) ON DELETE CASCADE,
  tx_signature TEXT NOT NULL,
  sol_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_levelup_seeker_tasks_player ON levelup_seeker_tasks(player_id, created_at DESC);

ALTER TABLE levelup_seeker_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY levelup_seeker_tasks_select ON levelup_seeker_tasks FOR SELECT USING (true);
CREATE POLICY levelup_seeker_tasks_insert ON levelup_seeker_tasks FOR INSERT WITH CHECK (true);
