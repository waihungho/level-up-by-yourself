-- Squad battles (3v3). Apply after 003_tactical_battles.sql.

CREATE TABLE IF NOT EXISTS levelup_squads (
  player_id  uuid PRIMARY KEY REFERENCES levelup_players(id) ON DELETE CASCADE,
  agent_ids  uuid[] NOT NULL CHECK (array_length(agent_ids, 1) = 3),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS levelup_squad_stats (
  player_id uuid PRIMARY KEY REFERENCES levelup_players(id) ON DELETE CASCADE,
  wins      int NOT NULL DEFAULT 0,
  losses    int NOT NULL DEFAULT 0,
  rating    int NOT NULL DEFAULT 1000
);
CREATE INDEX IF NOT EXISTS levelup_idx_squad_stats_rating ON levelup_squad_stats(rating DESC);

CREATE TABLE IF NOT EXISTS levelup_squad_battles (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attacker_player_id uuid NOT NULL REFERENCES levelup_players(id) ON DELETE CASCADE,
  defender_player_id uuid NOT NULL REFERENCES levelup_players(id) ON DELETE CASCADE,
  winner_player_id   uuid NOT NULL,
  attacker_squad     uuid[] NOT NULL,
  defender_squad     uuid[] NOT NULL,
  rounds             jsonb NOT NULL,
  rating_delta       int NOT NULL,
  manual_actions     int NOT NULL DEFAULT 0,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS levelup_idx_squad_battles_attacker ON levelup_squad_battles(attacker_player_id, created_at DESC);

-- Public read (leaderboards, rival squads); writes only via the service role.
ALTER TABLE levelup_squads ENABLE ROW LEVEL SECURITY;
ALTER TABLE levelup_squad_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE levelup_squad_battles ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'levelup_squads_select') THEN
    CREATE POLICY levelup_squads_select ON levelup_squads FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'levelup_squad_stats_select') THEN
    CREATE POLICY levelup_squad_stats_select ON levelup_squad_stats FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'levelup_squad_battles_select') THEN
    CREATE POLICY levelup_squad_battles_select ON levelup_squad_battles FOR SELECT USING (true);
  END IF;
END $$;

-- Atomic W/L + rating update for both players.
CREATE OR REPLACE FUNCTION levelup_squad_apply_result(p_winner uuid, p_loser uuid, p_delta int)
RETURNS void
LANGUAGE sql
AS $$
  INSERT INTO levelup_squad_stats (player_id, wins, losses, rating)
  VALUES (p_winner, 1, 0, 1000 + p_delta)
  ON CONFLICT (player_id) DO UPDATE SET wins = levelup_squad_stats.wins + 1, rating = levelup_squad_stats.rating + p_delta;
  INSERT INTO levelup_squad_stats (player_id, wins, losses, rating)
  VALUES (p_loser, 0, 1, 1000 - p_delta)
  ON CONFLICT (player_id) DO UPDATE SET losses = levelup_squad_stats.losses + 1, rating = levelup_squad_stats.rating - p_delta;
$$;
REVOKE EXECUTE ON FUNCTION levelup_squad_apply_result(uuid, uuid, int) FROM anon, authenticated, public;
