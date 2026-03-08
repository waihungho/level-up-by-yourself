"use client";
import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { useUnifiedWallet } from "@/hooks/useUnifiedWallet";
import { getOrCreatePlayer, getPlayerAgents } from "@/lib/db";
import { signInWithSolana } from "@/lib/auth";
import type { Player, Agent } from "@/lib/types";

interface GameState {
  player: Player | null;
  agents: Agent[];
  loading: boolean;
  error: string | null;
  refreshPlayer: () => Promise<void>;
  refreshAgents: () => Promise<void>;
}

const GameContext = createContext<GameState>({
  player: null,
  agents: [],
  loading: false,
  error: null,
  refreshPlayer: async () => {},
  refreshAgents: async () => {},
});

export function useGame() {
  return useContext(GameContext);
}

export function GameProvider({ children }: { children: ReactNode }) {
  const { publicKey, connected } = useUnifiedWallet();
  const [player, setPlayer] = useState<Player | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshPlayer = useCallback(async () => {
    if (!publicKey) return;
    try {
      const p = await getOrCreatePlayer(publicKey.toBase58());
      setPlayer(p);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load player");
    }
  }, [publicKey]);

  const refreshAgents = useCallback(async () => {
    if (!player) return;
    try {
      const a = await getPlayerAgents(player.id);
      setAgents(a);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load agents");
    }
  }, [player]);

  // Load player when wallet connects
  useEffect(() => {
    if (connected && publicKey) {
      setLoading(true);
      const walletAddress = publicKey.toBase58();
      signInWithSolana(walletAddress)
        .then(() => refreshPlayer())
        .finally(() => setLoading(false));
    } else {
      setPlayer(null);
      setAgents([]);
      setError(null);
    }
  }, [connected, publicKey, refreshPlayer]);

  // Load agents when player loads
  useEffect(() => {
    if (player) {
      refreshAgents();
    }
  }, [player, refreshAgents]);

  return (
    <GameContext.Provider value={{ player, agents, loading, error, refreshPlayer, refreshAgents }}>
      {children}
    </GameContext.Provider>
  );
}
