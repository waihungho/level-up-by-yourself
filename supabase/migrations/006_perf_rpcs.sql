-- =============================================
-- Migration 006: read RPCs that replace multi-request client waterfalls.
-- Safe to apply before or after deploying: the app falls back to the old
-- queries when a function is missing.
-- =============================================

-- Player + agents in one round trip (GameProvider startup on every page).
CREATE OR REPLACE FUNCTION levelup_bootstrap(p_wallet text)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_player levelup_players;
BEGIN
  INSERT INTO levelup_players (wallet_address) VALUES (p_wallet)
  ON CONFLICT (wallet_address) DO NOTHING;

  SELECT * INTO v_player FROM levelup_players WHERE wallet_address = p_wallet;

  RETURN jsonb_build_object(
    'player', to_jsonb(v_player),
    'agents', COALESCE(
      (SELECT jsonb_agg(to_jsonb(a) ORDER BY a.created_at DESC) FROM levelup_agents a WHERE a.player_id = v_player.id),
      '[]'::jsonb
    )
  );
END;
$$;

-- Today's (UTC) fight counts for many agents at once (/battle).
-- training: non-PvP fights since the latest paid recharge today (strictly after it), else since midnight.
-- pvp: PvP fights since midnight.
CREATE OR REPLACE FUNCTION levelup_fight_counts_today(p_agent_ids uuid[])
RETURNS TABLE (agent_id uuid, training int, pvp int)
LANGUAGE sql
STABLE
AS $$
  WITH day AS (
    SELECT date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AS start
  ),
  ids AS (
    SELECT DISTINCT unnest(p_agent_ids) AS id
  ),
  recharge AS (
    SELECT r.agent_id, max(r.created_at) AS at
    FROM levelup_fight_recharges r, day
    WHERE r.agent_id = ANY (p_agent_ids) AND r.created_at >= day.start
    GROUP BY r.agent_id
  ),
  logs AS (
    -- Two index-friendly branches instead of attacker_id = x OR defender_id = x.
    SELECT ids.id AS agent_id, l.id, l.pvp, l.created_at
    FROM ids, day, levelup_battle_logs l
    WHERE l.attacker_id = ids.id AND l.created_at >= day.start
    UNION
    SELECT ids.id, l.id, l.pvp, l.created_at
    FROM ids, day, levelup_battle_logs l
    WHERE l.defender_id = ids.id AND l.created_at >= day.start
  )
  SELECT
    ids.id,
    (count(logs.id) FILTER (WHERE NOT logs.pvp AND (rc.at IS NULL OR logs.created_at > rc.at)))::int,
    (count(logs.id) FILTER (WHERE logs.pvp))::int
  FROM ids
  LEFT JOIN recharge rc ON rc.agent_id = ids.id
  LEFT JOIN logs ON logs.agent_id = ids.id
  GROUP BY ids.id, rc.at;
$$;

-- One random agent owned by someone else (PvP start) without paging every agent id.
CREATE OR REPLACE FUNCTION levelup_random_opponent_agent(p_exclude_player uuid)
RETURNS uuid
LANGUAGE sql
VOLATILE
AS $$
  SELECT id FROM levelup_agents WHERE player_id <> p_exclude_player ORDER BY random() LIMIT 1;
$$;

-- Raid leaderboard: top N, participant count and the caller's rank, without reading every contribution.
CREATE OR REPLACE FUNCTION levelup_raid_standings(p_boss_id uuid, p_player_id uuid, p_limit int)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  WITH ranked AS (
    SELECT c.boss_id, c.player_id, c.damage, c.attempts, c.best_hit, c.label,
           row_number() OVER (ORDER BY c.damage DESC, c.player_id) AS rank
    FROM levelup_raid_contributions c
    WHERE c.boss_id = p_boss_id
  )
  SELECT jsonb_build_object(
    'top', COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.rank) FROM ranked r WHERE r.rank <= p_limit), '[]'::jsonb),
    'participants', (SELECT count(*) FROM ranked),
    'me', (SELECT to_jsonb(r) FROM ranked r WHERE r.player_id = p_player_id)
  );
$$;

GRANT EXECUTE ON FUNCTION levelup_bootstrap(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION levelup_fight_counts_today(uuid[]) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION levelup_random_opponent_agent(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION levelup_raid_standings(uuid, uuid, int) TO anon, authenticated, service_role;
