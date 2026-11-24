-- =============================================
-- Migration 015: Class Evolution. One permanent path per agent, chosen by its owner once the
-- agent's role category averages 80 (EVOLVE_AT, checked by the server). Kept in its own table (not a column
-- on levelup_agents) because anon can insert agents: a column could be set at summon time.
-- Reads are public (agent pages show the path); writes are service-role only.
-- =============================================

CREATE TABLE IF NOT EXISTS levelup_agent_evolutions (
  agent_id    uuid PRIMARY KEY REFERENCES levelup_agents(id) ON DELETE CASCADE,
  path        text NOT NULL CHECK (path IN ('paladin', 'berserker', 'archon', 'cyber_ninja', 'mastermind', 'diplomat')),
  evolved_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE levelup_agent_evolutions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'levelup_agent_evolutions_select') THEN
    CREATE POLICY levelup_agent_evolutions_select ON levelup_agent_evolutions FOR SELECT USING (true);
  END IF;
END $$;
