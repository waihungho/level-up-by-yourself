"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import type { BossDef } from "@/lib/raid/bosses";
import type { RaidBoss, RaidContribution, RaidHit } from "@/lib/raid/raid-read";
import type { RaidPhase } from "@/lib/raid/raid-engine";
import type { Category } from "@/lib/tactical/types";

export const RAID_POLL_MS = 15_000;
/** Safety net while Realtime looks healthy (e.g. tables missing from the publication send no events). */
export const RAID_SAFETY_POLL_MS = 60_000;
const MIN_REFETCH_GAP_MS = 2_000;

export interface RaidView {
  boss: RaidBoss | null;
  def?: BossDef | null;
  phase?: RaidPhase;
  weakness?: Category | null;
  contributions?: (RaidContribution & { rank: number; isMe: boolean })[];
  participants?: number;
  myRank?: number | null;
  myDamage?: number;
  attemptsLeft?: number | null;
  maxAttempts?: number;
  recentHits?: RaidHit[];
}

/**
 * Raid state with live updates: Supabase Realtime on the boss row and hit feed,
 * falling back to polling every 15s when Realtime is unavailable or errors.
 */
export function useRaidLive(walletAddress: string | null) {
  const [view, setView] = useState<RaidView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lastFetch = useRef(0);
  const pendingRefetch = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    lastFetch.current = Date.now();
    try {
      const res = await fetch(`/api/raid${walletAddress ? `?wallet=${encodeURIComponent(walletAddress)}` : ""}`);
      if (!res.ok) throw new Error(String(res.status));
      setView(await res.json());
      setError(null);
    } catch {
      setError("Couldn't load the raid. Retrying…");
    }
  }, [walletAddress]);

  /** Coalesces bursts of realtime events into at most one fetch every 2s. */
  const scheduleRefresh = useCallback(() => {
    if (pendingRefetch.current) return;
    const wait = Math.max(0, MIN_REFETCH_GAP_MS - (Date.now() - lastFetch.current));
    pendingRefetch.current = setTimeout(() => {
      pendingRefetch.current = null;
      refresh();
    }, wait);
  }, [refresh]);

  useEffect(() => {
    let poll: ReturnType<typeof setInterval> | null = null;
    let disposed = false;
    const startPolling = () => {
      // removeChannel() during cleanup reports CLOSED; never start polling after unmount.
      if (!disposed) poll ??= setInterval(refresh, RAID_POLL_MS);
    };

    refresh();
    const sb = getSupabase();
    const channel = sb
      ?.channel("raid-live")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "levelup_raid_bosses" }, scheduleRefresh)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "levelup_raid_hits" }, scheduleRefresh)
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") startPolling();
      });
    if (!channel) startPolling();
    const safety = channel ? setInterval(refresh, RAID_SAFETY_POLL_MS) : null;

    return () => {
      disposed = true;
      if (poll) clearInterval(poll);
      if (safety) clearInterval(safety);
      if (pendingRefetch.current) clearTimeout(pendingRefetch.current);
      pendingRefetch.current = null;
      if (sb && channel) sb.removeChannel(channel);
    };
  }, [refresh, scheduleRefresh]);

  return { view, error, refresh };
}
