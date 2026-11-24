-- =============================================
-- Migration 018: Summons and daily tasks run on the server (additive; safe to apply before deploying).
-- Summons are checked server-side: a free summon needs the 7-day cooldown to have passed, a paid one a
-- verified 0.1 SOL payment whose signature is recorded once. Daily tasks grant ability points once per
-- task per UTC day. Both functions are service-role only. 019 then removes the old browser-side paths.
-- =============================================

CREATE TABLE IF NOT EXISTS levelup_summon_payments (
  tx_signature text PRIMARY KEY,
  player_id    uuid NOT NULL REFERENCES levelup_players(id) ON DELETE CASCADE,
  agent_id     uuid REFERENCES levelup_agents(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE levelup_summon_payments ENABLE ROW LEVEL SECURITY;

-- result = 'ok' (agent = the new row) | 'not_found' | 'cooldown' | 'signature_used' | 'invalid_dimensions'.
-- The player row is locked, so two concurrent free summons can't both pass the cooldown check.
CREATE OR REPLACE FUNCTION levelup_summon_agent_server(
  p_player_id uuid, p_name text, p_role levelup_role_category, p_role_title text, p_character text, p_objective text,
  p_sprite_seed jsonb, p_initial_dimensions jsonb, p_payment_signature text, p_cooldown_days int
)
RETURNS TABLE(result text, agent jsonb)
LANGUAGE plpgsql
AS $$
DECLARE
  v_last timestamptz;
  v_agent levelup_agents;
  v_dim jsonb;
BEGIN
  SELECT p.last_summon_at INTO v_last FROM levelup_players p WHERE p.id = p_player_id FOR UPDATE;
  IF NOT FOUND THEN
    result := 'not_found'; RETURN NEXT; RETURN;
  END IF;

  IF jsonb_typeof(p_initial_dimensions) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_initial_dimensions) <> 50
     OR (SELECT count(DISTINCT (d->>'dimension_id')::int) FROM jsonb_array_elements(p_initial_dimensions) d) <> 50
     OR EXISTS (
       SELECT 1 FROM jsonb_array_elements(p_initial_dimensions) d
       WHERE (d->>'dimension_id')::int NOT BETWEEN 1 AND 50
          OR (d->>'value')::float IS NULL
          OR (d->>'value')::float NOT BETWEEN 0 AND 32.5
     ) THEN
    result := 'invalid_dimensions'; RETURN NEXT; RETURN;
  END IF;

  IF p_payment_signature IS NULL THEN
    IF v_last IS NOT NULL AND v_last > now() - make_interval(days => p_cooldown_days) THEN
      result := 'cooldown'; RETURN NEXT; RETURN;
    END IF;
  ELSE
    BEGIN
      INSERT INTO levelup_summon_payments (tx_signature, player_id) VALUES (p_payment_signature, p_player_id);
    EXCEPTION WHEN unique_violation THEN
      result := 'signature_used'; RETURN NEXT; RETURN;
    END;
  END IF;

  INSERT INTO levelup_agents (player_id, name, role, role_title, character, objective, sprite_seed)
  VALUES (p_player_id, p_name, p_role, p_role_title, p_character, p_objective, p_sprite_seed)
  RETURNING * INTO v_agent;

  FOR v_dim IN SELECT * FROM jsonb_array_elements(p_initial_dimensions) LOOP
    INSERT INTO levelup_agent_dimensions (agent_id, dimension_id, value)
    VALUES (v_agent.id, (v_dim->>'dimension_id')::int, (v_dim->>'value')::float);
  END LOOP;

  UPDATE levelup_players SET last_summon_at = now(), updated_at = now() WHERE id = p_player_id;
  IF p_payment_signature IS NOT NULL THEN
    UPDATE levelup_summon_payments SET agent_id = v_agent.id WHERE tx_signature = p_payment_signature;
  END IF;

  result := 'ok'; agent := to_jsonb(v_agent); RETURN NEXT;
END;
$$;
REVOKE EXECUTE ON FUNCTION levelup_summon_agent_server(uuid, text, levelup_role_category, text, text, text, jsonb, jsonb, text, int) FROM anon, authenticated, public;

-- Completes a daily task once per UTC day (the existing unique index decides) and adds its points.
-- Returns 'ok' or 'already_done'.
CREATE OR REPLACE FUNCTION levelup_complete_task(p_player uuid, p_task text, p_points int)
RETURNS text
LANGUAGE plpgsql
AS $$
BEGIN
  BEGIN
    INSERT INTO levelup_player_task_completions (player_id, task_name) VALUES (p_player, p_task);
  EXCEPTION WHEN unique_violation THEN
    RETURN 'already_done';
  END;
  UPDATE levelup_players SET ability_score = ability_score + p_points, updated_at = now() WHERE id = p_player;
  RETURN 'ok';
END;
$$;
REVOKE EXECUTE ON FUNCTION levelup_complete_task(uuid, text, int) FROM anon, authenticated, public;
