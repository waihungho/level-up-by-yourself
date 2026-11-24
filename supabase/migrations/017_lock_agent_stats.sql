-- =============================================
-- Migration 017: Agent stats are writable only by the server.
-- Before this, the public (anon) key could UPDATE any row of levelup_agent_dimensions, INSERT rows,
-- and call levelup_increment_dimension with any delta, so anyone could edit any agent's stats.
-- Every legitimate stat write already runs on the server; since this release they use the
-- service-role client (db.ts growth writes, the daily-growth job). Deploy that code BEFORE applying.
-- Summoning still runs from the browser through levelup_summon_agent (SECURITY DEFINER), which now
-- rejects starting stats a real summon can't produce.
-- =============================================

DROP POLICY IF EXISTS levelup_agent_dims_update ON levelup_agent_dimensions;
DROP POLICY IF EXISTS levelup_agent_dims_insert ON levelup_agent_dimensions;

REVOKE EXECUTE ON FUNCTION levelup_increment_dimension(uuid, integer, double precision) FROM anon, authenticated, public;

-- Same as before, plus validation: exactly the 50 dimensions, each once, each 0–32.5
-- (BASE_DIMENSION_VALUE 10 + BONUS_MAX 15 × the highest role weight 1.5).
CREATE OR REPLACE FUNCTION public.levelup_summon_agent(p_player_id uuid, p_name text, p_role levelup_role_category, p_role_title text, p_character text, p_objective text, p_sprite_seed jsonb, p_initial_dimensions jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  new_agent_id UUID;
  dim JSONB;
  agent_row RECORD;
BEGIN
  IF jsonb_typeof(p_initial_dimensions) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_initial_dimensions) <> 50
     OR (SELECT count(DISTINCT (d->>'dimension_id')::int) FROM jsonb_array_elements(p_initial_dimensions) d) <> 50
     OR EXISTS (
       SELECT 1 FROM jsonb_array_elements(p_initial_dimensions) d
       WHERE (d->>'dimension_id')::int NOT BETWEEN 1 AND 50
          OR (d->>'value')::float IS NULL
          OR (d->>'value')::float NOT BETWEEN 0 AND 32.5
     ) THEN
    RAISE EXCEPTION 'invalid_dimensions';
  END IF;

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
$function$;
