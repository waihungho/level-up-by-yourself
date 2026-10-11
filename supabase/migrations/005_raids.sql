-- Weekly boss raids. Apply after 004_squads.sql.

CREATE TABLE IF NOT EXISTS levelup_raid_bosses (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  boss_key           text NOT NULL,
  week_start         date NOT NULL UNIQUE,
  stats              jsonb NOT NULL,
  max_hp             bigint NOT NULL CHECK (max_hp > 0),
  hp_remaining       bigint NOT NULL CHECK (hp_remaining >= 0),
  status             text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'defeated', 'expired')),
  last_hit_player_id uuid REFERENCES levelup_players(id) ON DELETE SET NULL,
  defeated_at        timestamptz,
  paid_out_at        timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS levelup_idx_raid_bosses_status ON levelup_raid_bosses(status, week_start DESC);

CREATE TABLE IF NOT EXISTS levelup_raid_contributions (
  boss_id   uuid NOT NULL REFERENCES levelup_raid_bosses(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES levelup_players(id) ON DELETE CASCADE,
  damage    bigint NOT NULL DEFAULT 0,
  attempts  int NOT NULL DEFAULT 0,
  best_hit  int NOT NULL DEFAULT 0,
  PRIMARY KEY (boss_id, player_id)
);
CREATE INDEX IF NOT EXISTS levelup_idx_raid_contrib_damage ON levelup_raid_contributions(boss_id, damage DESC);

CREATE TABLE IF NOT EXISTS levelup_raid_hits (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  boss_id    uuid NOT NULL REFERENCES levelup_raid_bosses(id) ON DELETE CASCADE,
  player_id  uuid NOT NULL REFERENCES levelup_players(id) ON DELETE CASCADE,
  damage     bigint NOT NULL,
  counters   int NOT NULL DEFAULT 0,
  label      text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS levelup_idx_raid_hits_boss ON levelup_raid_hits(boss_id, created_at DESC);
CREATE INDEX IF NOT EXISTS levelup_idx_raid_hits_player ON levelup_raid_hits(player_id, created_at DESC);

CREATE TABLE IF NOT EXISTS levelup_player_trophies (
  player_id uuid NOT NULL REFERENCES levelup_players(id) ON DELETE CASCADE,
  boss_id   uuid NOT NULL REFERENCES levelup_raid_bosses(id) ON DELETE CASCADE,
  tier      text NOT NULL CHECK (tier IN ('champion', 'elite', 'vanguard', 'slayer')),
  PRIMARY KEY (player_id, boss_id, tier)
);

-- Public read (live HP, feed, leaderboards); writes only via the service role.
ALTER TABLE levelup_raid_bosses ENABLE ROW LEVEL SECURITY;
ALTER TABLE levelup_raid_contributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE levelup_raid_hits ENABLE ROW LEVEL SECURITY;
ALTER TABLE levelup_player_trophies ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'levelup_raid_bosses_select') THEN
    CREATE POLICY levelup_raid_bosses_select ON levelup_raid_bosses FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'levelup_raid_contributions_select') THEN
    CREATE POLICY levelup_raid_contributions_select ON levelup_raid_contributions FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'levelup_raid_hits_select') THEN
    CREATE POLICY levelup_raid_hits_select ON levelup_raid_hits FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'levelup_player_trophies_select') THEN
    CREATE POLICY levelup_player_trophies_select ON levelup_player_trophies FOR SELECT USING (true);
  END IF;
END $$;

-- Atomic damage: row lock serialises concurrent attempts so exactly one call reports killed = true.
-- Contribution and feed rows are recorded even after the boss is defeated.
CREATE OR REPLACE FUNCTION levelup_raid_apply_damage(
  p_boss uuid, p_player uuid, p_damage bigint, p_best int, p_counters int, p_label text
)
RETURNS TABLE(hp_remaining bigint, killed boolean)
LANGUAGE plpgsql
AS $$
DECLARE
  v_prev   bigint;
  v_new    bigint;
  v_status text;
  v_killed boolean := false;
BEGIN
  SELECT b.hp_remaining, b.status INTO v_prev, v_status
  FROM levelup_raid_bosses b WHERE b.id = p_boss FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'boss % not found', p_boss;
  END IF;

  v_new := v_prev;
  IF v_status = 'active' THEN
    v_new := GREATEST(v_prev - GREATEST(p_damage, 0), 0);
    v_killed := v_new = 0 AND v_prev > 0;
    UPDATE levelup_raid_bosses SET
      hp_remaining       = v_new,
      status             = CASE WHEN v_killed THEN 'defeated' ELSE status END,
      last_hit_player_id = CASE WHEN v_killed THEN p_player ELSE last_hit_player_id END,
      defeated_at        = CASE WHEN v_killed THEN now() ELSE defeated_at END
    WHERE id = p_boss;
  END IF;

  INSERT INTO levelup_raid_contributions (boss_id, player_id, damage, attempts, best_hit)
  VALUES (p_boss, p_player, GREATEST(p_damage, 0), 1, p_best)
  ON CONFLICT (boss_id, player_id) DO UPDATE SET
    damage   = levelup_raid_contributions.damage + EXCLUDED.damage,
    attempts = levelup_raid_contributions.attempts + 1,
    best_hit = GREATEST(levelup_raid_contributions.best_hit, EXCLUDED.best_hit);

  INSERT INTO levelup_raid_hits (boss_id, player_id, damage, counters, label)
  VALUES (p_boss, p_player, GREATEST(p_damage, 0), p_counters, p_label);

  hp_remaining := v_new;
  killed := v_killed;
  RETURN NEXT;
END;
$$;
REVOKE EXECUTE ON FUNCTION levelup_raid_apply_damage(uuid, uuid, bigint, int, int, text) FROM anon, authenticated, public;

-- Live HP bar + hit feed. Requires Realtime to be enabled for the project.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE levelup_raid_bosses;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE levelup_raid_hits;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;
