-- =============================================
-- Migration 013: Blink challenges (Solana Actions).
--
-- Anyone with a Solana wallet can fight a shared agent from a Blink. The challenger signs a
-- fee-only memo transaction (memo `levelup:blink:<agentId>`, no SOL moves); the server verifies
-- it on-chain and records one row per transaction signature. A replayed signature returns the
-- stored result. Exhibition fights only: no growth, rating or gems change.
--
-- Private table: rows link challenger wallets to player ids and signatures, so there is no
-- public select policy. The server reads and writes it with the service role only.
-- =============================================

CREATE TABLE IF NOT EXISTS levelup_blink_challenges (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id             uuid NOT NULL REFERENCES levelup_agents(id) ON DELETE CASCADE,
  -- Owner of the challenged agent (the defender's Pass XP cap counts by this).
  defender_player_id   uuid NOT NULL REFERENCES levelup_players(id) ON DELETE CASCADE,
  challenger_wallet    text NOT NULL,
  challenger_player_id uuid REFERENCES levelup_players(id) ON DELETE SET NULL,
  tx_signature         text NOT NULL UNIQUE,
  winner               text NOT NULL CHECK (winner IN ('challenger', 'defender')),
  summary              jsonb NOT NULL,
  -- UTC date the challenge counts against (daily limits).
  day                  date NOT NULL DEFAULT ((now() AT TIME ZONE 'utc')::date),
  created_at           timestamptz NOT NULL DEFAULT now()
);

-- Backstop for the 1-per-wallet-and-agent-per-day limit (the function below checks it first).
CREATE UNIQUE INDEX IF NOT EXISTS levelup_blink_one_per_wallet_agent_day
  ON levelup_blink_challenges (challenger_wallet, agent_id, day);
CREATE INDEX IF NOT EXISTS levelup_idx_blink_wallet_day ON levelup_blink_challenges (challenger_wallet, day);
CREATE INDEX IF NOT EXISTS levelup_idx_blink_agent_created ON levelup_blink_challenges (agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS levelup_idx_blink_defender_day ON levelup_blink_challenges (defender_player_id, day, created_at);

ALTER TABLE levelup_blink_challenges ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS levelup_blink_challenges_select ON levelup_blink_challenges;

-- Records a challenge atomically with its daily limits. A per-wallet-and-day advisory lock
-- serialises concurrent results, so the 5-per-day count can't be raced.
-- Returns 'ok' (with the new id) | 'duplicate_signature' | 'agent_limit' | 'daily_limit'.
CREATE OR REPLACE FUNCTION levelup_blink_record_challenge(
  p_agent uuid,
  p_defender_player uuid,
  p_wallet text,
  p_player uuid,
  p_signature text,
  p_winner text,
  p_summary jsonb,
  p_day date,
  p_daily_limit int DEFAULT 5
) RETURNS TABLE (status text, challenge_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_wallet || ':' || p_day::text));

  IF EXISTS (SELECT 1 FROM levelup_blink_challenges c WHERE c.tx_signature = p_signature) THEN
    RETURN QUERY SELECT 'duplicate_signature'::text, NULL::uuid;
    RETURN;
  END IF;
  IF EXISTS (
    SELECT 1 FROM levelup_blink_challenges c
    WHERE c.challenger_wallet = p_wallet AND c.agent_id = p_agent AND c.day = p_day
  ) THEN
    RETURN QUERY SELECT 'agent_limit'::text, NULL::uuid;
    RETURN;
  END IF;
  IF (SELECT count(*) FROM levelup_blink_challenges c WHERE c.challenger_wallet = p_wallet AND c.day = p_day) >= p_daily_limit THEN
    RETURN QUERY SELECT 'daily_limit'::text, NULL::uuid;
    RETURN;
  END IF;

  INSERT INTO levelup_blink_challenges
    (agent_id, defender_player_id, challenger_wallet, challenger_player_id, tx_signature, winner, summary, day)
  VALUES
    (p_agent, p_defender_player, p_wallet, p_player, p_signature, p_winner, p_summary, p_day)
  RETURNING id INTO v_id;
  RETURN QUERY SELECT 'ok'::text, v_id;
EXCEPTION WHEN unique_violation THEN
  -- Same signature recorded concurrently under another wallet's lock.
  RETURN QUERY SELECT 'duplicate_signature'::text, NULL::uuid;
END;
$$;

REVOKE EXECUTE ON FUNCTION levelup_blink_record_challenge(uuid, uuid, text, uuid, text, text, jsonb, date, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION levelup_blink_record_challenge(uuid, uuid, text, uuid, text, text, jsonb, date, int) TO service_role;
