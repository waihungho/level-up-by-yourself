"use client";
import { useCallback, useEffect, useState } from "react";
import { buildRankings, type Rankings } from "@/lib/rankings";
import { isSupabaseConfigured } from "@/lib/supabase";

export const RANKINGS_CACHE_KEY = "rankings_cache_v1";

function readCache(): Rankings | null {
  try {
    const raw = localStorage.getItem(RANKINGS_CACHE_KEY);
    return raw ? (JSON.parse(raw) as Rankings) : null;
  } catch {
    return null;
  }
}

function writeCache(r: Rankings): void {
  try {
    localStorage.setItem(RANKINGS_CACHE_KEY, JSON.stringify(r));
  } catch {
    // storage full/unavailable: next visit just waits for the network
  }
}

/** Rankings are computed server-side and CDN-cached; demo mode keeps data in the browser, so compute it here. */
async function fetchRankings(): Promise<Rankings> {
  if (!isSupabaseConfigured) return buildRankings();
  const res = await fetch("/api/rank");
  if (!res.ok) throw new Error(`rank ${res.status}`);
  return res.json();
}

/**
 * Rankings for the rank page: shows the last-seen rankings instantly (stale-while-revalidate in
 * the browser) and starts the network request on first render, without waiting for player startup.
 */
export function useRankings() {
  const [rankings, setRankings] = useState<Rankings | null>(null);
  const [refreshing, setRefreshing] = useState(true);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const cached = attempt === 0 ? readCache() : null;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is only readable after mount
    if (cached) setRankings(cached);
    fetchRankings()
      .then((r) => {
        if (cancelled) return;
        setRankings(r);
        writeCache(r);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setRefreshing(false);
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setError(false);
    setRefreshing(true);
    setAttempt((a) => a + 1);
  }, []);

  return { rankings, refreshing, error, retry };
}
