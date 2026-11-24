-- =============================================
-- Migration 019: The browser can no longer write game state directly. Apply AFTER deploying the code
-- that moved summons (/api/summon), daily tasks (/api/tasks/complete), battle and growth logs, PvP
-- records and ability points to the server (service role).
-- Kept for the browser: creating a player row (levelup_players INSERT) and the Seeker task log.
-- =============================================

-- Direct table writes.
DROP POLICY IF EXISTS levelup_players_update ON levelup_players;
DROP POLICY IF EXISTS levelup_agents_insert ON levelup_agents;
DROP POLICY IF EXISTS levelup_task_completions_insert ON levelup_player_task_completions;
DROP POLICY IF EXISTS levelup_battle_logs_insert ON levelup_battle_logs;
DROP POLICY IF EXISTS levelup_growth_logs_insert ON levelup_growth_logs;

-- Functions the browser used to call (the server keeps its service-role access).
REVOKE EXECUTE ON FUNCTION levelup_summon_agent(uuid, text, levelup_role_category, text, text, text, jsonb, jsonb) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION increment_ability_score(uuid, integer) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION levelup_pvp_increment(uuid, integer, integer) FROM anon, authenticated, public;
