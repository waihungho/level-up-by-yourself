-- Fix task completions table to use task_name instead of task_id FK
-- The app code stores task names directly, not task IDs

-- Drop the existing unique index first
DROP INDEX IF EXISTS levelup_task_completions_daily;

-- Drop old columns/constraints and add new ones
ALTER TABLE levelup_player_task_completions
  DROP COLUMN IF EXISTS task_id,
  ADD COLUMN IF NOT EXISTS task_name TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- Drop completed_at only if it exists (safe)
ALTER TABLE levelup_player_task_completions
  DROP COLUMN IF EXISTS completed_at;

-- Recreate daily unique index using task_name
CREATE UNIQUE INDEX IF NOT EXISTS levelup_task_completions_daily
  ON levelup_player_task_completions(player_id, task_name, (cast(created_at at time zone 'utc' as date)));

-- Index for querying by player and date
DROP INDEX IF EXISTS levelup_idx_player_task_completions_player_date;
CREATE INDEX levelup_idx_player_task_completions_player_date
  ON levelup_player_task_completions(player_id, created_at);

-- increment_ability_score RPC
CREATE OR REPLACE FUNCTION increment_ability_score(p_player_id UUID, p_points INTEGER)
RETURNS VOID AS $$
BEGIN
  UPDATE levelup_players
  SET ability_score = ability_score + p_points, updated_at = NOW()
  WHERE id = p_player_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop old function first (return type changed from UUID to JSONB)
DROP FUNCTION IF EXISTS levelup_summon_agent(UUID, TEXT, levelup_role_category, TEXT, TEXT, TEXT, JSONB, JSONB);

-- Fix summon_agent to return full row as JSONB instead of just UUID
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
RETURNS JSONB AS $$
DECLARE
  new_agent_id UUID;
  dim JSONB;
  agent_row RECORD;
BEGIN
  INSERT INTO levelup_agents (player_id, name, role, role_title, character, objective, sprite_seed)
  VALUES (p_player_id, p_name, p_role, p_role_title, p_character, p_objective, p_sprite_seed)
  RETURNING * INTO agent_row;

  new_agent_id := agent_row.id;

  FOR dim IN SELECT * FROM jsonb_array_elements(p_initial_dimensions)
  LOOP
    INSERT INTO levelup_agent_dimensions (agent_id, dimension_id, value)
    VALUES (new_agent_id, (dim->>'dimension_id')::INTEGER, (dim->>'value')::FLOAT);
  END LOOP;

  UPDATE levelup_players SET last_summon_at = NOW(), updated_at = NOW() WHERE id = p_player_id;

  RETURN row_to_json(agent_row)::JSONB;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Seeker tasks table
CREATE TABLE IF NOT EXISTS levelup_seeker_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES levelup_players(id) ON DELETE CASCADE,
  tx_signature TEXT NOT NULL,
  sol_amount FLOAT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS levelup_idx_seeker_tasks_player
  ON levelup_seeker_tasks(player_id);

-- RLS for seeker tasks
ALTER TABLE levelup_seeker_tasks ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'levelup_seeker_tasks_select' AND tablename = 'levelup_seeker_tasks') THEN
    CREATE POLICY levelup_seeker_tasks_select ON levelup_seeker_tasks FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'levelup_seeker_tasks_insert' AND tablename = 'levelup_seeker_tasks') THEN
    CREATE POLICY levelup_seeker_tasks_insert ON levelup_seeker_tasks FOR INSERT WITH CHECK (
      player_id IN (SELECT id FROM levelup_players WHERE wallet_address = current_setting('app.wallet_address', true))
    );
  END IF;
END $$;

-- Battle logs table
CREATE TABLE IF NOT EXISTS levelup_battle_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attacker_id UUID NOT NULL REFERENCES levelup_agents(id) ON DELETE CASCADE,
  defender_id UUID NOT NULL REFERENCES levelup_agents(id) ON DELETE CASCADE,
  winner_id UUID NOT NULL REFERENCES levelup_agents(id) ON DELETE CASCADE,
  rounds JSONB NOT NULL DEFAULT '[]',
  attacker_growth JSONB NOT NULL DEFAULT '{}',
  defender_growth JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS levelup_idx_battle_logs_attacker ON levelup_battle_logs(attacker_id);
CREATE INDEX IF NOT EXISTS levelup_idx_battle_logs_defender ON levelup_battle_logs(defender_id);

ALTER TABLE levelup_battle_logs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'levelup_battle_logs_select' AND tablename = 'levelup_battle_logs') THEN
    CREATE POLICY levelup_battle_logs_select ON levelup_battle_logs FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'levelup_battle_logs_insert' AND tablename = 'levelup_battle_logs') THEN
    CREATE POLICY levelup_battle_logs_insert ON levelup_battle_logs FOR INSERT WITH CHECK (true);
  END IF;
END $$;
