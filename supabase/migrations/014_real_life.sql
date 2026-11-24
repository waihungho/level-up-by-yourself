-- =============================================
-- Migration 014: Real Life (habits, daily real-life quests, focus/meditation sessions, steps).
-- Real-life activities grow an agent, capped per player per UTC day (honor system).
-- Service-role writes only; no anon policies. Requires 008 (levelup_apply_growth).
-- =============================================

CREATE TABLE IF NOT EXISTS levelup_life_habits (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id   uuid NOT NULL REFERENCES levelup_players(id) ON DELETE CASCADE,
  name        text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 40),
  category    text NOT NULL CHECK (category IN ('Physical', 'Mental', 'Social', 'Spiritual', 'Technical')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);
CREATE INDEX IF NOT EXISTS levelup_idx_life_habits_player ON levelup_life_habits(player_id) WHERE archived_at IS NULL;
ALTER TABLE levelup_life_habits ENABLE ROW LEVEL SECURITY;

-- One row per grant. (player, kind, ref, day) is unique, so each habit / quest / session / steps
-- entry can be claimed once a day, and a retried request is a no-op.
CREATE TABLE IF NOT EXISTS levelup_life_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id   uuid NOT NULL REFERENCES levelup_players(id) ON DELETE CASCADE,
  agent_id    uuid REFERENCES levelup_agents(id) ON DELETE SET NULL,
  kind        text NOT NULL CHECK (kind IN ('habit', 'quest', 'steps', 'focus', 'meditation')),
  ref         text NOT NULL,
  day         date NOT NULL,
  points      real NOT NULL CHECK (points >= 0),
  growth      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (player_id, kind, ref, day)
);
CREATE INDEX IF NOT EXISTS levelup_idx_life_logs_player_day ON levelup_life_logs(player_id, day);
ALTER TABLE levelup_life_logs ENABLE ROW LEVEL SECURITY;

-- Timed focus / meditation sessions: started and finished by the server clock.
CREATE TABLE IF NOT EXISTS levelup_life_sessions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id   uuid NOT NULL REFERENCES levelup_players(id) ON DELETE CASCADE,
  agent_id    uuid NOT NULL REFERENCES levelup_agents(id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('focus', 'meditation')),
  minutes     int NOT NULL CHECK (minutes > 0),
  started_at  timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
-- One open session per player.
CREATE UNIQUE INDEX IF NOT EXISTS levelup_uq_life_sessions_open ON levelup_life_sessions(player_id) WHERE finished_at IS NULL;
ALTER TABLE levelup_life_sessions ENABLE ROW LEVEL SECURITY;

-- Grants real-life growth under the daily cap, in one transaction per player (advisory lock).
-- Growth is scaled down when only part of the cap is left. result = 'ok' | 'duplicate' | 'cap'.
CREATE OR REPLACE FUNCTION levelup_life_grant(
  p_player uuid, p_agent uuid, p_kind text, p_ref text, p_day date, p_points real, p_growth jsonb, p_cap real
)
RETURNS TABLE(result text, granted real, total real)
LANGUAGE plpgsql
AS $$
DECLARE
  v_total real;
  v_granted real;
  v_scaled jsonb;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('levelup_life:' || p_player::text));
  IF EXISTS (SELECT 1 FROM levelup_life_logs l WHERE l.player_id = p_player AND l.kind = p_kind AND l.ref = p_ref AND l.day = p_day) THEN
    result := 'duplicate'; granted := 0;
    SELECT COALESCE(sum(l.points), 0) INTO total FROM levelup_life_logs l WHERE l.player_id = p_player AND l.day = p_day;
    RETURN NEXT; RETURN;
  END IF;

  SELECT COALESCE(sum(l.points), 0) INTO v_total FROM levelup_life_logs l WHERE l.player_id = p_player AND l.day = p_day;
  IF v_total >= p_cap THEN
    result := 'cap'; granted := 0; total := v_total; RETURN NEXT; RETURN;
  END IF;

  v_granted := LEAST(p_points, p_cap - v_total);
  SELECT COALESCE(jsonb_object_agg(g.key, round((g.value::numeric * v_granted / NULLIF(p_points, 0))::numeric, 2)), '{}'::jsonb)
    INTO v_scaled FROM jsonb_each_text(p_growth) AS g(key, value);

  INSERT INTO levelup_life_logs (player_id, agent_id, kind, ref, day, points, growth)
  VALUES (p_player, p_agent, p_kind, p_ref, p_day, v_granted, v_scaled);
  PERFORM levelup_apply_growth(p_agent, v_scaled);

  result := 'ok'; granted := v_granted; total := v_total + v_granted; RETURN NEXT;
END;
$$;
REVOKE EXECUTE ON FUNCTION levelup_life_grant(uuid, uuid, text, text, date, real, jsonb, real) FROM anon, authenticated, public;

-- Finishes a session once its time is up (server clock) and grants it, in one transaction.
-- result = 'ok' | 'cap' | 'duplicate' | 'not_found' | 'too_early'.
CREATE OR REPLACE FUNCTION levelup_life_finish_session(
  p_id uuid, p_player uuid, p_now timestamptz, p_grace_s int, p_day date, p_points real, p_growth jsonb, p_cap real
)
RETURNS TABLE(result text, granted real, total real)
LANGUAGE plpgsql
AS $$
DECLARE
  v_row levelup_life_sessions;
BEGIN
  UPDATE levelup_life_sessions s SET finished_at = p_now
  WHERE s.id = p_id AND s.player_id = p_player AND s.finished_at IS NULL
    AND s.started_at + make_interval(mins => s.minutes) - make_interval(secs => p_grace_s) <= p_now
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    IF EXISTS (SELECT 1 FROM levelup_life_sessions s WHERE s.id = p_id AND s.player_id = p_player AND s.finished_at IS NULL) THEN
      result := 'too_early';
    ELSE
      result := 'not_found';
    END IF;
    granted := 0; total := 0; RETURN NEXT; RETURN;
  END IF;

  RETURN QUERY SELECT * FROM levelup_life_grant(p_player, v_row.agent_id, v_row.kind, v_row.id::text, p_day, p_points, p_growth, p_cap);
END;
$$;
REVOKE EXECUTE ON FUNCTION levelup_life_finish_session(uuid, uuid, timestamptz, int, date, real, jsonb, real) FROM anon, authenticated, public;
