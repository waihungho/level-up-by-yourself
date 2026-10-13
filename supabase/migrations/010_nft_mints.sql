-- =============================================
-- Migration 010: agent NFT mints (Metaplex Core).
--
-- A row is a claim "this agent is being, or has been, minted as the Core asset at this
-- address". It is written BEFORE the transaction is built, so the partial unique index is a
-- real double-mint guard: a second tab is stopped before it gets a second signable tx.
-- The agent itself is untouched; `snapshot` records what was frozen into the NFT.
-- Public read; writes only via the service-role functions below.
-- =============================================

CREATE TABLE IF NOT EXISTS levelup_nft_mints (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id      uuid NOT NULL REFERENCES levelup_agents(id) ON DELETE CASCADE,
  player_id     uuid NOT NULL REFERENCES levelup_players(id) ON DELETE CASCADE,
  asset_address text NOT NULL UNIQUE,
  metadata_uri  text NOT NULL,
  -- Null until confirmed. NULLs are distinct in a unique index.
  tx_signature  text UNIQUE,
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'expired')),
  snapshot      jsonb NOT NULL,
  sol_amount    numeric,
  created_at    timestamptz NOT NULL DEFAULT now(),
  confirmed_at  timestamptz
);

-- The double-mint guard: one live claim per agent; expired rows do not count.
CREATE UNIQUE INDEX IF NOT EXISTS levelup_nft_one_live_per_agent
  ON levelup_nft_mints (agent_id) WHERE status IN ('pending', 'confirmed');
CREATE INDEX IF NOT EXISTS levelup_idx_nft_mints_player ON levelup_nft_mints (player_id, created_at DESC);

ALTER TABLE levelup_nft_mints ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'levelup_nft_mints_select') THEN
    CREATE POLICY levelup_nft_mints_select ON levelup_nft_mints FOR SELECT USING (true);
  END IF;
END $$;

-- Reserve a mint. Stale pendings (> 3 min, past the blockhash validity window, so an
-- abandoned tx can no longer land) are expired first. Mirrored client-side as
-- MINT_RESERVATION_TTL_MS in src/lib/nft/eligibility.ts — change both together.
-- The rate limit is checked under a per-player advisory lock so a burst can't race it.
CREATE OR REPLACE FUNCTION levelup_reserve_nft_mint(
  p_player_id     uuid,
  p_agent_id      uuid,
  p_asset_address text,
  p_metadata_uri  text,
  p_snapshot      jsonb,
  p_rate_limit    int
) RETURNS levelup_nft_mints
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_owner  uuid;
  v_recent int;
  v_row    levelup_nft_mints;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('levelup_nft_mint:' || p_player_id::text, 0));

  UPDATE levelup_nft_mints SET status = 'expired'
   WHERE agent_id = p_agent_id AND status = 'pending' AND created_at < now() - interval '3 minutes';

  SELECT player_id INTO v_owner FROM levelup_agents WHERE id = p_agent_id;
  IF v_owner IS NULL OR v_owner <> p_player_id THEN
    RAISE EXCEPTION 'That agent is not yours' USING ERRCODE = 'check_violation';
  END IF;

  SELECT count(*) INTO v_recent FROM levelup_nft_mints
   WHERE player_id = p_player_id AND created_at > now() - interval '10 minutes';
  IF v_recent >= p_rate_limit THEN
    RAISE EXCEPTION 'Too many mint requests' USING ERRCODE = 'check_violation';
  END IF;

  BEGIN
    INSERT INTO levelup_nft_mints (agent_id, player_id, asset_address, metadata_uri, snapshot)
    VALUES (p_agent_id, p_player_id, p_asset_address, p_metadata_uri, p_snapshot)
    RETURNING * INTO v_row;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'That agent already has a mint' USING ERRCODE = 'check_violation';
  END;
  RETURN v_row;
END;
$$;

-- Confirm a mint that landed on chain. Idempotent for the same signature. An `expired` row
-- is accepted too (a paid tx that landed late is still a real mint); the partial unique index
-- refuses it only if another live claim for the agent exists.
CREATE OR REPLACE FUNCTION levelup_confirm_nft_mint(
  p_asset_address text,
  p_tx_signature  text,
  p_sol_amount    numeric
) RETURNS levelup_nft_mints
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_row levelup_nft_mints;
BEGIN
  SELECT * INTO v_row FROM levelup_nft_mints WHERE asset_address = p_asset_address FOR UPDATE;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'No such mint' USING ERRCODE = 'check_violation';
  END IF;
  IF v_row.status = 'confirmed' THEN
    IF v_row.tx_signature IS NOT DISTINCT FROM p_tx_signature THEN
      RETURN v_row;
    END IF;
    RAISE EXCEPTION 'Already confirmed with a different signature' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE levelup_nft_mints
     SET status = 'confirmed', tx_signature = p_tx_signature, sol_amount = p_sol_amount, confirmed_at = now()
   WHERE id = v_row.id
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION levelup_reserve_nft_mint(uuid, uuid, text, text, jsonb, int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION levelup_confirm_nft_mint(text, text, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION levelup_reserve_nft_mint(uuid, uuid, text, text, jsonb, int) TO service_role;
GRANT EXECUTE ON FUNCTION levelup_confirm_nft_mint(text, text, numeric) TO service_role;
