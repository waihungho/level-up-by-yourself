-- =============================================
-- Migration 008: gem shop (gem wallet, ledger, purchases, item effects).
-- All writes go through server routes with the service role; no anon write policies.
-- =============================================

CREATE TABLE IF NOT EXISTS levelup_gem_wallets (
  player_id  uuid PRIMARY KEY REFERENCES levelup_players(id) ON DELETE CASCADE,
  balance    int NOT NULL DEFAULT 0 CHECK (balance >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS levelup_gem_ledger (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id  uuid NOT NULL REFERENCES levelup_players(id) ON DELETE CASCADE,
  delta      int NOT NULL,
  reason     text NOT NULL,
  ref        text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS levelup_idx_gem_ledger_player ON levelup_gem_ledger(player_id, created_at DESC);

-- One row per verified SOL payment for a gem pack (signature can be credited once).
CREATE TABLE IF NOT EXISTS levelup_gem_purchases (
  tx_signature text PRIMARY KEY,
  player_id    uuid NOT NULL REFERENCES levelup_players(id) ON DELETE CASCADE,
  pack_id      text NOT NULL,
  sol          numeric NOT NULL,
  gems         int NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Training Scroll: doubles daily growth until expires_at.
CREATE TABLE IF NOT EXISTS levelup_agent_buffs (
  agent_id   uuid NOT NULL REFERENCES levelup_agents(id) ON DELETE CASCADE,
  kind       text NOT NULL CHECK (kind IN ('growth_x2')),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (agent_id, kind)
);

-- Refills / tickets: extra attempts for one UTC day.
CREATE TABLE IF NOT EXISTS levelup_attempt_bonuses (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id  uuid NOT NULL REFERENCES levelup_players(id) ON DELETE CASCADE,
  agent_id   uuid REFERENCES levelup_agents(id) ON DELETE CASCADE,
  mode       text NOT NULL CHECK (mode IN ('training', 'pvp', 'squad_pvp', 'raid')),
  extra      int NOT NULL CHECK (extra > 0),
  day        date NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS levelup_idx_attempt_bonuses_day ON levelup_attempt_bonuses(day, mode, player_id);

-- Cosmetics (public read so everyone sees auras / name colours / titles).
CREATE TABLE IF NOT EXISTS levelup_agent_cosmetics (
  agent_id uuid NOT NULL REFERENCES levelup_agents(id) ON DELETE CASCADE,
  kind     text NOT NULL CHECK (kind IN ('aura', 'namecolor')),
  value    text NOT NULL,
  PRIMARY KEY (agent_id, kind)
);
CREATE TABLE IF NOT EXISTS levelup_player_titles (
  player_id uuid PRIMARY KEY REFERENCES levelup_players(id) ON DELETE CASCADE,
  title     text NOT NULL
);

ALTER TABLE levelup_gem_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE levelup_gem_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE levelup_gem_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE levelup_agent_buffs ENABLE ROW LEVEL SECURITY;
ALTER TABLE levelup_attempt_bonuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE levelup_agent_cosmetics ENABLE ROW LEVEL SECURITY;
ALTER TABLE levelup_player_titles ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'levelup_agent_cosmetics_select') THEN
    CREATE POLICY levelup_agent_cosmetics_select ON levelup_agent_cosmetics FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'levelup_player_titles_select') THEN
    CREATE POLICY levelup_player_titles_select ON levelup_player_titles FOR SELECT USING (true);
  END IF;
END $$;

-- Atomic, idempotent gem credit/spend. A repeated ref is a no-op; overspending raises insufficient_gems.
CREATE OR REPLACE FUNCTION levelup_gems_apply(p_player uuid, p_delta int, p_reason text, p_ref text)
RETURNS TABLE(balance int, applied boolean)
LANGUAGE plpgsql
AS $$
DECLARE
  v_balance int;
BEGIN
  INSERT INTO levelup_gem_wallets (player_id) VALUES (p_player) ON CONFLICT (player_id) DO NOTHING;
  SELECT w.balance INTO v_balance FROM levelup_gem_wallets w WHERE w.player_id = p_player FOR UPDATE;

  IF EXISTS (SELECT 1 FROM levelup_gem_ledger l WHERE l.ref = p_ref) THEN
    balance := v_balance; applied := false; RETURN NEXT; RETURN;
  END IF;
  IF v_balance + p_delta < 0 THEN
    RAISE EXCEPTION 'insufficient_gems';
  END IF;

  INSERT INTO levelup_gem_ledger (player_id, delta, reason, ref) VALUES (p_player, p_delta, p_reason, p_ref);
  UPDATE levelup_gem_wallets w SET balance = w.balance + p_delta, updated_at = now() WHERE w.player_id = p_player
  RETURNING w.balance INTO v_balance;

  balance := v_balance; applied := true; RETURN NEXT;
END;
$$;
REVOKE EXECUTE ON FUNCTION levelup_gems_apply(uuid, int, text, text) FROM anon, authenticated, public;

-- Elixirs: add stat points to many dimensions atomically (all or nothing). p_changes = {"<dimension_id>": delta}.
CREATE OR REPLACE FUNCTION levelup_apply_growth(p_agent uuid, p_changes jsonb)
RETURNS void
LANGUAGE sql
AS $$
  UPDATE levelup_agent_dimensions ad
  SET value = ad.value + (c.value)::float
  FROM jsonb_each_text(p_changes) AS c(key, value)
  WHERE ad.agent_id = p_agent AND ad.dimension_id = c.key::int;
$$;
REVOKE EXECUTE ON FUNCTION levelup_apply_growth(uuid, jsonb) FROM anon, authenticated, public;

-- Training Scroll: extend the growth buff atomically from max(now, current expiry).
CREATE OR REPLACE FUNCTION levelup_extend_buff(p_agent uuid, p_kind text, p_days int)
RETURNS timestamptz
LANGUAGE sql
AS $$
  INSERT INTO levelup_agent_buffs (agent_id, kind, expires_at)
  VALUES (p_agent, p_kind, now() + make_interval(days => p_days))
  ON CONFLICT (agent_id, kind) DO UPDATE
    SET expires_at = GREATEST(levelup_agent_buffs.expires_at, now()) + make_interval(days => p_days)
  RETURNING expires_at;
$$;
REVOKE EXECUTE ON FUNCTION levelup_extend_buff(uuid, text, int) FROM anon, authenticated, public;
