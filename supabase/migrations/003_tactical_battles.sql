-- Tactical battles: server-authoritative multi-turn sessions.
-- Apply in the Supabase SQL editor before deploying the tactical battle code.

CREATE TABLE IF NOT EXISTS levelup_battle_sessions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mode          text NOT NULL CHECK (mode IN ('training', 'pvp', 'squad_pvp', 'raid')),
  player_id     uuid NOT NULL REFERENCES levelup_players(id) ON DELETE CASCADE,
  attacker_id   uuid REFERENCES levelup_agents(id) ON DELETE CASCADE,
  defender_id   uuid REFERENCES levelup_agents(id) ON DELETE CASCADE,
  state         jsonb NOT NULL,
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'finalizing', 'finished')),
  battle_log_id uuid,
  result        jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS levelup_idx_sessions_attacker_active ON levelup_battle_sessions(attacker_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS levelup_idx_sessions_defender_active ON levelup_battle_sessions(defender_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS levelup_idx_sessions_player_active ON levelup_battle_sessions(player_id, mode) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS levelup_idx_sessions_stale ON levelup_battle_sessions(created_at) WHERE status = 'active';

-- No policies: only the service role (server routes) can read or write sessions.
ALTER TABLE levelup_battle_sessions ENABLE ROW LEVEL SECURITY;

ALTER TABLE levelup_battle_logs ADD COLUMN IF NOT EXISTS tactical boolean NOT NULL DEFAULT false;
ALTER TABLE levelup_battle_logs ADD COLUMN IF NOT EXISTS manual_actions int NOT NULL DEFAULT 0;

-- Ordering battle logs by date currently hits the statement timeout without this.
CREATE INDEX IF NOT EXISTS levelup_idx_battle_logs_created ON levelup_battle_logs(created_at DESC);

-- Paid fight recharges (0.05 SOL), verified on-chain by /api/battle/recharge.
-- Training fights are counted from the latest recharge of the day.
CREATE TABLE IF NOT EXISTS levelup_fight_recharges (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id     uuid NOT NULL REFERENCES levelup_agents(id) ON DELETE CASCADE,
  player_id    uuid NOT NULL REFERENCES levelup_players(id) ON DELETE CASCADE,
  tx_signature text NOT NULL UNIQUE,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS levelup_idx_fight_recharges_agent ON levelup_fight_recharges(agent_id, created_at DESC);
ALTER TABLE levelup_fight_recharges ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'levelup_fight_recharges_select') THEN
    CREATE POLICY levelup_fight_recharges_select ON levelup_fight_recharges FOR SELECT USING (true);
  END IF;
END $$;
