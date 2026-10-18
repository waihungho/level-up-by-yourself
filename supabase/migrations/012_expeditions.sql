-- =============================================
-- Migration 012: Expeditions (agents sent away for 4/8/12h, reward rolled at start).
-- Service-role writes only; no anon policies.
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
