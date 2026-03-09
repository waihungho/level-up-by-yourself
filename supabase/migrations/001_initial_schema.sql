-- Enum for role categories
CREATE TYPE levelup_role_category AS ENUM ('future', 'modern', 'medieval');

-- Players table
CREATE TABLE levelup_players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT UNIQUE NOT NULL,
  ability_score INTEGER DEFAULT 0,
  last_summon_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Dimensions reference table (50 rows)
CREATE TABLE levelup_dimensions (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('Physical', 'Mental', 'Social', 'Spiritual', 'Technical'))
);

-- Agents table
CREATE TABLE levelup_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES levelup_players(id) ON DELETE CASCADE,
  name TEXT UNIQUE NOT NULL,
  role levelup_role_category NOT NULL,
  role_title TEXT NOT NULL,
  character TEXT NOT NULL,
  objective TEXT NOT NULL,
  sprite_seed JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Agent dimensions (50 per agent)
CREATE TABLE levelup_agent_dimensions (
  agent_id UUID NOT NULL REFERENCES levelup_agents(id) ON DELETE CASCADE,
  dimension_id INTEGER NOT NULL REFERENCES levelup_dimensions(id),
  value FLOAT NOT NULL DEFAULT 10,
  PRIMARY KEY (agent_id, dimension_id)
);

-- Daily tasks reference table
CREATE TABLE levelup_daily_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  ability_points INTEGER NOT NULL
);

-- Player task completions
CREATE TABLE levelup_player_task_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES levelup_players(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES levelup_daily_tasks(id),
  completed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX levelup_task_completions_daily
  ON levelup_player_task_completions(player_id, task_id, (cast(completed_at at time zone 'utc' as date)));

-- Growth logs
CREATE TABLE levelup_growth_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES levelup_agents(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  dimension_changes JSONB NOT NULL DEFAULT '{}',
  narrative TEXT,
  UNIQUE(agent_id, date)
);

-- Indexes
CREATE INDEX levelup_idx_agents_player_id ON levelup_agents(player_id);
CREATE INDEX levelup_idx_agent_dimensions_agent_id ON levelup_agent_dimensions(agent_id);
CREATE INDEX levelup_idx_growth_logs_agent_id ON levelup_growth_logs(agent_id);
CREATE INDEX levelup_idx_player_task_completions_player_date ON levelup_player_task_completions(player_id, completed_at);

-- Immutability trigger: prevent UPDATE on agent name, character, objective
CREATE OR REPLACE FUNCTION levelup_prevent_agent_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.name != NEW.name OR OLD.character != NEW.character OR OLD.objective != NEW.objective THEN
    RAISE EXCEPTION 'Cannot modify agent name, character, or objective after creation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER levelup_agent_immutability
  BEFORE UPDATE ON levelup_agents
  FOR EACH ROW
  EXECUTE FUNCTION levelup_prevent_agent_mutation();

-- Summon cooldown check function
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

-- Summon agent RPC function
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
RETURNS UUID AS $$
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

  RETURN new_agent_id;
END;
$$ LANGUAGE plpgsql;

-- Increment dimension value (used by growth cron)
CREATE OR REPLACE FUNCTION levelup_increment_dimension(
  p_agent_id UUID,
  p_dimension_id INTEGER,
  p_delta FLOAT
)
RETURNS VOID AS $$
BEGIN
  UPDATE levelup_agent_dimensions
  SET value = value + p_delta
  WHERE agent_id = p_agent_id AND dimension_id = p_dimension_id;
END;
$$ LANGUAGE plpgsql;

-- Wallet context function for RLS (called from app via supabase.rpc)
CREATE OR REPLACE FUNCTION set_wallet_context(wallet TEXT)
RETURNS VOID AS $$
BEGIN
  PERFORM set_config('app.wallet_address', wallet, true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RLS policies (wallet-based, not auth.uid)
ALTER TABLE levelup_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE levelup_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE levelup_agent_dimensions ENABLE ROW LEVEL SECURITY;
ALTER TABLE levelup_player_task_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE levelup_growth_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY levelup_players_select ON levelup_players FOR SELECT USING (true);
CREATE POLICY levelup_players_insert ON levelup_players FOR INSERT WITH CHECK (true);
CREATE POLICY levelup_players_update ON levelup_players FOR UPDATE
  USING (wallet_address = current_setting('app.wallet_address', true));

CREATE POLICY levelup_agents_select ON levelup_agents FOR SELECT USING (true);
CREATE POLICY levelup_agents_insert ON levelup_agents FOR INSERT WITH CHECK (
  player_id IN (SELECT id FROM levelup_players WHERE wallet_address = current_setting('app.wallet_address', true))
);

CREATE POLICY levelup_agent_dims_select ON levelup_agent_dimensions FOR SELECT USING (true);
CREATE POLICY levelup_agent_dims_insert ON levelup_agent_dimensions FOR INSERT WITH CHECK (true);

CREATE POLICY levelup_task_completions_select ON levelup_player_task_completions FOR SELECT USING (true);
CREATE POLICY levelup_task_completions_insert ON levelup_player_task_completions FOR INSERT WITH CHECK (
  player_id IN (SELECT id FROM levelup_players WHERE wallet_address = current_setting('app.wallet_address', true))
);

CREATE POLICY levelup_growth_logs_select ON levelup_growth_logs FOR SELECT USING (true);

-- Seed the 50 dimensions
INSERT INTO levelup_dimensions (id, name, category) VALUES
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
INSERT INTO levelup_daily_tasks (name, description, ability_points) VALUES
  ('Daily Login', 'Log in to the game', 5),
  ('View Agents', 'Visit your agents page', 3),
  ('Check Growth', 'View an agent''s growth log', 5),
  ('Read Narrative', 'Read a growth narrative', 2);
