-- =============================================
-- Migration 009: agent equipment (weapon / armor / relic), uncapped levels.
-- Public read (everyone sees gear); writes only via the service role.
-- =============================================

CREATE TABLE IF NOT EXISTS levelup_agent_gear (
  agent_id   uuid NOT NULL REFERENCES levelup_agents(id) ON DELETE CASCADE,
  slot       text NOT NULL CHECK (slot IN ('weapon', 'armor', 'relic')),
  level      int NOT NULL CHECK (level >= 1),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (agent_id, slot)
);
ALTER TABLE levelup_agent_gear ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'levelup_agent_gear_select') THEN
    CREATE POLICY levelup_agent_gear_select ON levelup_agent_gear FOR SELECT USING (true);
  END IF;
END $$;

-- Optimistic level bump: succeeds only if the slot is still at p_expected (0 = no gear yet).
CREATE OR REPLACE FUNCTION levelup_gear_upgrade(p_agent uuid, p_slot text, p_expected int)
RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  v_rows int;
BEGIN
  IF p_expected = 0 THEN
    INSERT INTO levelup_agent_gear (agent_id, slot, level) VALUES (p_agent, p_slot, 1)
    ON CONFLICT (agent_id, slot) DO NOTHING;
  ELSE
    UPDATE levelup_agent_gear SET level = level + 1, updated_at = now()
    WHERE agent_id = p_agent AND slot = p_slot AND level = p_expected;
  END IF;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows = 1;
END;
$$;
REVOKE EXECUTE ON FUNCTION levelup_gear_upgrade(uuid, text, int) FROM anon, authenticated, public;
