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
  -- Set when /prepare hands out a signable tx. Until block height passes this, that tx can still
  -- land, so the reservation must not be reclaimed (see levelup_reserve_nft_mint).
  last_valid_block_height bigint,
  tx_built_at   timestamptz,
  -- Rate-limit bookkeeping: whether the request carried a wallet signature, and a salted hash of
  -- its client IP (never the raw IP: this table is publicly readable).
  signed        boolean NOT NULL DEFAULT false,
  source        text,
  sol_amount    numeric,
  created_at    timestamptz NOT NULL DEFAULT now(),
  confirmed_at  timestamptz
);

-- The double-mint guard: one live claim per agent; expired rows do not count.
CREATE UNIQUE INDEX IF NOT EXISTS levelup_nft_one_live_per_agent
  ON levelup_nft_mints (agent_id) WHERE status IN ('pending', 'confirmed');
CREATE INDEX IF NOT EXISTS levelup_idx_nft_mints_player ON levelup_nft_mints (player_id, created_at DESC);
CREATE INDEX IF NOT EXISTS levelup_idx_nft_mints_unsigned ON levelup_nft_mints (created_at DESC) WHERE NOT signed;

ALTER TABLE levelup_nft_mints ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'levelup_nft_mints_select') THEN
    CREATE POLICY levelup_nft_mints_select ON levelup_nft_mints FOR SELECT USING (true);
  END IF;
END $$;

-- Reserve a mint.
--
-- A live pending row is reclaimed ONLY when the server names it in p_reclaim_asset AND the row
-- itself still proves its transaction can't land, re-checked here against the row's current
-- values (so a prepare that publishes its tx concurrently wins):
--   * a tx was handed out (last_valid_block_height set) and the server has observed a block
--     height above it, after checking the asset does not exist; or
--   * no tx was ever handed out and the row is older than 3 minutes. /prepare publishes a tx only
--     via a compare-and-set on status = 'pending', so an expired row can never publish later.
-- A wall-clock TTL alone can't prove a tx is dead: the blockhash is fetched after the uploads.
--
-- Rate limits run under advisory locks (the player's, plus one shared lock for unsigned requests)
-- so bursts can't race the counts.
-- Requests without a wallet signature only *claim* a player, so they are also limited per source
-- (client IP) and globally: each reservation costs the mint authority an upload.
CREATE OR REPLACE FUNCTION levelup_reserve_nft_mint(
  p_player_id      uuid,
  p_agent_id       uuid,
  p_asset_address  text,
  p_metadata_uri   text,
  p_snapshot       jsonb,
  p_signed         boolean,
  p_source         text,
  p_player_limit   int,
  p_source_limit   int,
  p_global_unsigned_limit int,
  p_reclaim_asset  text,
  p_observed_block_height bigint
) RETURNS levelup_nft_mints
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_owner  uuid;
  v_count  int;
  v_row    levelup_nft_mints;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('levelup_nft_mint:' || p_player_id::text, 0));
  IF NOT p_signed THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('levelup_nft_mint_unsigned', 0));
  END IF;

  IF p_reclaim_asset IS NOT NULL THEN
    UPDATE levelup_nft_mints SET status = 'expired'
     WHERE agent_id = p_agent_id AND status = 'pending' AND asset_address = p_reclaim_asset
       AND (
         (last_valid_block_height IS NOT NULL AND p_observed_block_height > last_valid_block_height)
         OR (last_valid_block_height IS NULL AND created_at < now() - interval '3 minutes')
       );
  END IF;

  SELECT player_id INTO v_owner FROM levelup_agents WHERE id = p_agent_id;
  IF v_owner IS NULL OR v_owner <> p_player_id THEN
    RAISE EXCEPTION 'That agent is not yours' USING ERRCODE = 'check_violation';
  END IF;

  SELECT count(*) INTO v_count FROM levelup_nft_mints
   WHERE player_id = p_player_id AND created_at > now() - interval '10 minutes';
  IF v_count >= p_player_limit THEN
    RAISE EXCEPTION 'Too many mint requests' USING ERRCODE = 'check_violation';
  END IF;

  IF NOT p_signed THEN
    SELECT count(*) INTO v_count FROM levelup_nft_mints
     WHERE NOT signed AND source = p_source AND created_at > now() - interval '10 minutes';
    IF v_count >= p_source_limit THEN
      RAISE EXCEPTION 'Too many mint requests' USING ERRCODE = 'check_violation';
    END IF;
    SELECT count(*) INTO v_count FROM levelup_nft_mints
     WHERE NOT signed AND created_at > now() - interval '10 minutes';
    IF v_count >= p_global_unsigned_limit THEN
      RAISE EXCEPTION 'Too many mint requests' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  BEGIN
    INSERT INTO levelup_nft_mints (agent_id, player_id, asset_address, metadata_uri, snapshot, signed, source)
    VALUES (p_agent_id, p_player_id, p_asset_address, p_metadata_uri, p_snapshot, p_signed, p_source)
    RETURNING * INTO v_row;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'That agent already has a mint' USING ERRCODE = 'check_violation';
  END;
  RETURN v_row;
END;
$$;

-- Confirm a mint that landed on chain. Idempotent for the same signature. An `expired` row is
-- accepted too (a paid tx is still a real mint). Because reclaiming requires proof that the old
-- tx can't land, an expired row should never land while a newer claim is live; if it somehow
-- does, the partial unique index refuses it and the route logs it for manual follow-up.
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

REVOKE ALL ON FUNCTION levelup_reserve_nft_mint(uuid, uuid, text, text, jsonb, boolean, text, int, int, int, text, bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION levelup_confirm_nft_mint(text, text, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION levelup_reserve_nft_mint(uuid, uuid, text, text, jsonb, boolean, text, int, int, int, text, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION levelup_confirm_nft_mint(text, text, numeric) TO service_role;
