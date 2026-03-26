-- supabase/migrations/pvp.sql
-- Run this in the Supabase SQL Editor (it is not auto-applied)

-- 1. Add pvp flag to battle logs (default false = training)
ALTER TABLE levelup_battle_logs ADD COLUMN IF NOT EXISTS pvp boolean NOT NULL DEFAULT false;

-- 2. Create PvP stats table
CREATE TABLE IF NOT EXISTS levelup_pvp_stats (
  agent_id  UUID PRIMARY KEY REFERENCES levelup_agents(id) ON DELETE CASCADE,
  wins      INT NOT NULL DEFAULT 0,
  losses    INT NOT NULL DEFAULT 0
);

-- 3. Atomic upsert+increment function used by updatePvpStats
CREATE OR REPLACE FUNCTION levelup_pvp_increment(p_agent_id uuid, p_wins int, p_losses int)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO levelup_pvp_stats (agent_id, wins, losses)
  VALUES (p_agent_id, p_wins, p_losses)
  ON CONFLICT (agent_id) DO UPDATE
    SET wins = levelup_pvp_stats.wins + EXCLUDED.wins,
        losses = levelup_pvp_stats.losses + EXCLUDED.losses;
END;
$$;
