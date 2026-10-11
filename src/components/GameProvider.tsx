"use client";
import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { useUnifiedWallet } from "@/hooks/useUnifiedWallet";
import { bootstrapPlayer, getOrCreatePlayer, getPlayerAgents } from "@/lib/db";
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

  // Base58 string, so a new PublicKey object for the same wallet doesn't reload everything.
  const wallet = connected && publicKey ? publicKey.toBase58() : null;
  const playerId = player?.id ?? null;

  const refreshPlayer = useCallback(async () => {
    if (!wallet) return;
    try {
      setPlayer(await getOrCreatePlayer(wallet));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load player");
    }
  }, [wallet]);

  const refreshAgents = useCallback(async () => {
    if (!playerId) return;
    try {
      setAgents(await getPlayerAgents(playerId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load agents");
    }
  }, [playerId]);

  // Load player and agents together when the wallet connects
  useEffect(() => {
    if (!wallet) {
      setPlayer(null);
      setAgents([]);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    bootstrapPlayer(wallet)
      .then((data) => {
        if (cancelled) return;
        setPlayer(data.player);
        setAgents(data.agents);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load player");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [wallet]);

  return (
    <GameContext.Provider value={{ player, agents, loading, error, refreshPlayer, refreshAgents }}>
      {children}
    </GameContext.Provider>
  );
}
