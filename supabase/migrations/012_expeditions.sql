-- =============================================
-- Migration 012: Expeditions (agents sent away for 4/8/12h, reward rolled at start).
-- Service-role writes only; no anon policies. Requires 008 (levelup_apply_growth, levelup_gems_apply).
-- =============================================

CREATE TABLE IF NOT EXISTS levelup_expeditions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id   uuid NOT NULL REFERENCES levelup_players(id) ON DELETE CASCADE,
  agent_id    uuid NOT NULL REFERENCES levelup_agents(id) ON DELETE CASCADE,
  duration_h  int NOT NULL CHECK (duration_h IN (4, 8, 12)),
  started_at  timestamptz NOT NULL DEFAULT now(),
  ends_at     timestamptz NOT NULL,
  claimed_at  timestamptz,
  reward      jsonb NOT NULL
);

-- One unclaimed expedition per agent (running or waiting to be claimed).
CREATE UNIQUE INDEX IF NOT EXISTS levelup_uq_expeditions_agent_open ON levelup_expeditions(agent_id) WHERE claimed_at IS NULL;
-- Open-slot counts and listings per player.
CREATE INDEX IF NOT EXISTS levelup_idx_expeditions_player ON levelup_expeditions(player_id, claimed_at);

ALTER TABLE levelup_expeditions ENABLE ROW LEVEL SECURITY;

-- Start: one transaction per player (advisory lock), so the open-expedition cap can't be raced.
-- result = 'ok' (expedition = the new row) | 'limit' | 'agent_away'.
CREATE OR REPLACE FUNCTION levelup_start_expedition(
  p_player uuid, p_agent uuid, p_duration int, p_started_at timestamptz, p_reward jsonb, p_max int
)
RETURNS TABLE(result text, expedition jsonb)
LANGUAGE plpgsql
AS $$
DECLARE
  v_row levelup_expeditions;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('levelup_expeditions:' || p_player::text));
  IF (SELECT count(*) FROM levelup_expeditions e WHERE e.player_id = p_player AND e.claimed_at IS NULL) >= p_max THEN
    result := 'limit'; RETURN NEXT; RETURN;
  END IF;
  BEGIN
    INSERT INTO levelup_expeditions (player_id, agent_id, duration_h, started_at, ends_at, reward)
    VALUES (p_player, p_agent, p_duration, p_started_at, p_started_at + make_interval(hours => p_duration), p_reward)
    RETURNING * INTO v_row;
  EXCEPTION WHEN unique_violation THEN
    result := 'agent_away'; RETURN NEXT; RETURN;
  END;
  result := 'ok'; expedition := to_jsonb(v_row); RETURN NEXT;
END;
$$;
REVOKE EXECUTE ON FUNCTION levelup_start_expedition(uuid, uuid, int, timestamptz, jsonb, int) FROM anon, authenticated, public;

-- Claim: marks the expedition claimed and grants growth, gems and the raid ticket in ONE transaction
-- (all or nothing). result = 'ok' | 'not_found' | 'not_owner' | 'not_ready' | 'already_claimed';
-- expedition is the row whenever it exists. Gems use ref 'exp:<id>' (idempotent ledger).
CREATE OR REPLACE FUNCTION levelup_claim_expedition(p_id uuid, p_player uuid, p_now timestamptz)
RETURNS TABLE(result text, expedition jsonb, balance int, gems_granted int)
LANGUAGE plpgsql
AS $$
DECLARE
  v_row levelup_expeditions;
  v_gems int;
  v_balance int;
  v_applied boolean := false;
BEGIN
  UPDATE levelup_expeditions e SET claimed_at = now()
  WHERE e.id = p_id AND e.player_id = p_player AND e.claimed_at IS NULL AND e.ends_at <= p_now
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    SELECT * INTO v_row FROM levelup_expeditions e WHERE e.id = p_id;
    IF NOT FOUND THEN
      result := 'not_found';
    ELSIF v_row.player_id <> p_player THEN
      result := 'not_owner';
    ELSIF v_row.claimed_at IS NOT NULL THEN
      result := 'already_claimed'; expedition := to_jsonb(v_row);
    ELSE
      result := 'not_ready'; expedition := to_jsonb(v_row);
    END IF;
    RETURN NEXT; RETURN;
  END IF;

  PERFORM levelup_apply_growth(v_row.agent_id, v_row.reward->'growth');

  v_gems := COALESCE((v_row.reward->>'gems')::int, 0);
  IF v_gems > 0 THEN
    SELECT g.balance, g.applied INTO v_balance, v_applied FROM levelup_gems_apply(p_player, v_gems, 'expedition', 'exp:' || v_row.id::text) g;
  ELSE
    SELECT w.balance INTO v_balance FROM levelup_gem_wallets w WHERE w.player_id = p_player;
  END IF;

  -- A Raid Ticket is +1 raid attempt for the (UTC) day it is claimed.
  IF COALESCE((v_row.reward->>'ticket')::boolean, false) THEN
    INSERT INTO levelup_attempt_bonuses (player_id, agent_id, mode, extra) VALUES (p_player, NULL, 'raid', 1);
  END IF;

  result := 'ok';
  expedition := to_jsonb(v_row);
  balance := COALESCE(v_balance, 0);
  gems_granted := CASE WHEN v_applied THEN v_gems ELSE 0 END;
  RETURN NEXT;
END;
$$;
REVOKE EXECUTE ON FUNCTION levelup_claim_expedition(uuid, uuid, timestamptz) FROM anon, authenticated, public;
