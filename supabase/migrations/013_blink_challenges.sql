-- =============================================
-- Migration 013: Blink challenges (Solana Actions).
--
-- Anyone with a Solana wallet can fight a shared agent from a Blink. The challenger signs a
-- memo-only transaction (memo `levelup:blink:<agentId>`, network fee only); the server verifies
-- it on-chain and records one row per transaction signature. A replayed signature returns the
-- stored result. Exhibition fights only: no growth, rating or gems change.
--
-- `day` (UTC date) backs the "1 challenge per wallet and agent per UTC day" limit with a unique
-- index, so two concurrent results can't both pass it. The 5-per-wallet-per-day limit is
-- re-checked by the server after insert.
-- Public read (the challenge page lists recent results); writes only with the service role.
-- =============================================

CREATE TABLE IF NOT EXISTS levelup_blink_challenges (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id             uuid NOT NULL REFERENCES levelup_agents(id) ON DELETE CASCADE,
  challenger_wallet    text NOT NULL,
  challenger_player_id uuid REFERENCES levelup_players(id) ON DELETE SET NULL,
  tx_signature         text NOT NULL UNIQUE,
  winner               text NOT NULL CHECK (winner IN ('challenger', 'defender')),
  summary              jsonb NOT NULL,
  day                  date NOT NULL DEFAULT ((now() AT TIME ZONE 'utc')::date),
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS levelup_blink_one_per_wallet_agent_day
  ON levelup_blink_challenges (challenger_wallet, agent_id, day);
CREATE INDEX IF NOT EXISTS levelup_idx_blink_wallet_created ON levelup_blink_challenges (challenger_wallet, created_at);
CREATE INDEX IF NOT EXISTS levelup_idx_blink_agent_created ON levelup_blink_challenges (agent_id, created_at DESC);

ALTER TABLE levelup_blink_challenges ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'levelup_blink_challenges_select') THEN
    CREATE POLICY levelup_blink_challenges_select ON levelup_blink_challenges FOR SELECT USING (true);
  END IF;
END $$;
