-- =============================================
-- Migration 016: Story Campaign and Seasonal Event stages.
-- Fights run as battle sessions with mode 'story' (the enemy is generated, so defender_id is NULL).
-- The first win on a stage pays gems and growth once, in one transaction.
-- Service-role writes only; reads are service-role too. Requires 008 (levelup_apply_growth, levelup_gems_apply).
-- =============================================

ALTER TABLE levelup_battle_sessions DROP CONSTRAINT IF EXISTS levelup_battle_sessions_mode_check;
ALTER TABLE levelup_battle_sessions ADD CONSTRAINT levelup_battle_sessions_mode_check
  CHECK (mode IN ('training', 'pvp', 'squad_pvp', 'raid', 'story'));

CREATE TABLE IF NOT EXISTS levelup_story_progress (
  player_id   uuid NOT NULL REFERENCES levelup_players(id) ON DELETE CASCADE,
  stage_id    text NOT NULL,
  agent_id    uuid REFERENCES levelup_agents(id) ON DELETE SET NULL,
  cleared_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, stage_id)
);
ALTER TABLE levelup_story_progress ENABLE ROW LEVEL SECURITY;

-- Records a stage clear and, only the first time, grants its gems (ref 'story:<player>:<stage>') and growth.
-- first_clear = false on a replay. balance is the player's gem balance afterwards.
CREATE OR REPLACE FUNCTION levelup_story_clear(p_player uuid, p_stage text, p_agent uuid, p_gems int, p_growth jsonb)
RETURNS TABLE(first_clear boolean, balance int)
LANGUAGE plpgsql
AS $$
DECLARE
  v_balance int;
BEGIN
  INSERT INTO levelup_story_progress (player_id, stage_id, agent_id) VALUES (p_player, p_stage, p_agent)
  ON CONFLICT (player_id, stage_id) DO NOTHING;
  IF NOT FOUND THEN
    SELECT w.balance INTO v_balance FROM levelup_gem_wallets w WHERE w.player_id = p_player;
    first_clear := false; balance := COALESCE(v_balance, 0); RETURN NEXT; RETURN;
  END IF;

  PERFORM levelup_apply_growth(p_agent, p_growth);
  IF p_gems > 0 THEN
    SELECT g.balance INTO v_balance FROM levelup_gems_apply(p_player, p_gems, 'story', 'story:' || p_player::text || ':' || p_stage) g;
  ELSE
    SELECT w.balance INTO v_balance FROM levelup_gem_wallets w WHERE w.player_id = p_player;
  END IF;
  first_clear := true; balance := COALESCE(v_balance, 0); RETURN NEXT;
END;
$$;
REVOKE EXECUTE ON FUNCTION levelup_story_clear(uuid, text, uuid, int, jsonb) FROM anon, authenticated, public;
