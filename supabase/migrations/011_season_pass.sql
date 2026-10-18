-- =============================================
-- Migration 011: Season Pass (XP, premium unlocks, reward claims).
-- Service-role writes only; no anon policies.
-- =============================================

CREATE TABLE IF NOT EXISTS levelup_pass_xp (
  player_id  uuid NOT NULL REFERENCES levelup_players(id) ON DELETE CASCADE,
  season     int NOT NULL,
  xp         int NOT NULL DEFAULT 0 CHECK (xp >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, season)
);

-- One row per XP grant; ref makes every grant idempotent (fight:<session>, login:<date>, ...).
CREATE TABLE IF NOT EXISTS levelup_pass_events (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id  uuid NOT NULL REFERENCES levelup_players(id) ON DELETE CASCADE,
  season     int NOT NULL,
  source     text NOT NULL,
  ref        text NOT NULL UNIQUE,
  xp         int NOT NULL CHECK (xp > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS levelup_idx_pass_events_player ON levelup_pass_events(player_id, source, created_at DESC);

ALTER TABLE levelup_pass_xp ENABLE ROW LEVEL SECURITY;
ALTER TABLE levelup_pass_events ENABLE ROW LEVEL SECURITY;

-- Atomic, idempotent XP grant. A repeated ref is a no-op (applied=false).
CREATE OR REPLACE FUNCTION levelup_pass_add_xp(p_player uuid, p_season int, p_source text, p_ref text, p_xp int)
RETURNS TABLE(xp int, applied boolean)
LANGUAGE plpgsql
AS $$
DECLARE
  v_xp int;
BEGIN
  INSERT INTO levelup_pass_events (player_id, season, source, ref, xp)
  VALUES (p_player, p_season, p_source, p_ref, p_xp)
  ON CONFLICT (ref) DO NOTHING;
  IF NOT FOUND THEN
    SELECT x.xp INTO v_xp FROM levelup_pass_xp x WHERE x.player_id = p_player AND x.season = p_season;
    xp := COALESCE(v_xp, 0); applied := false; RETURN NEXT; RETURN;
  END IF;
  INSERT INTO levelup_pass_xp AS x (player_id, season, xp) VALUES (p_player, p_season, p_xp)
  ON CONFLICT (player_id, season) DO UPDATE SET xp = x.xp + EXCLUDED.xp, updated_at = now()
  RETURNING x.xp INTO v_xp;
  xp := v_xp; applied := true; RETURN NEXT;
END;
$$;
REVOKE EXECUTE ON FUNCTION levelup_pass_add_xp(uuid, int, text, text, int) FROM anon, authenticated, public;

-- Premium unlock, paid once per season; tx_signature UNIQUE stops a payment being redeemed twice.
CREATE TABLE IF NOT EXISTS levelup_pass_premium (
  player_id    uuid NOT NULL REFERENCES levelup_players(id) ON DELETE CASCADE,
  season       int NOT NULL,
  tx_signature text NOT NULL UNIQUE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, season)
);

-- One row per claimed reward. Inserted before the grant, deleted again if the grant fails.
CREATE TABLE IF NOT EXISTS levelup_pass_claims (
  player_id  uuid NOT NULL REFERENCES levelup_players(id) ON DELETE CASCADE,
  season     int NOT NULL,
  tier       int NOT NULL CHECK (tier BETWEEN 1 AND 30),
  track      text NOT NULL CHECK (track IN ('free', 'premium')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, season, tier, track)
);

ALTER TABLE levelup_pass_premium ENABLE ROW LEVEL SECURITY;
ALTER TABLE levelup_pass_claims ENABLE ROW LEVEL SECURITY;
