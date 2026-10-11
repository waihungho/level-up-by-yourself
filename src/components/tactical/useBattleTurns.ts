"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { TacticalRound } from "@/lib/tactical/types";

export interface TurnResponse<S> {
  rounds: TacticalRound[];
  state: S;
  finished: boolean;
  [extra: string]: unknown;
}

interface Options<S> {
  sessionId: string;
  walletAddress: string;
  initialState: S;
  /** Called with each server response; the component animates `rounds` then applies `state`. */
  onResponse: (res: TurnResponse<S>) => void;
}

/**
 * Posts turns to /api/battle/turn with optimistic round versioning.
 * On 409 (double tap / retry) it refetches the authoritative session state.
 */
export function useBattleTurns<S extends { round: number }>({ sessionId, walletAddress, initialState, onResponse }: Options<S>) {
  const [state, setState] = useState<S>(initialState);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  const onResponseRef = useRef(onResponse);

  useEffect(() => {
    onResponseRef.current = onResponse;
  }, [onResponse]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/battle/session/${sessionId}?wallet=${encodeURIComponent(walletAddress)}`);
    if (!res.ok) throw new Error("refresh_failed");
    const data = (await res.json()) as { state: S };
    if (mounted.current) setState(data.state);
  }, [sessionId, walletAddress]);

  const send = useCallback(
    async (action: unknown) => {
      if (busy) return;
      setBusy(true);
      setError(null);
      try {
        const res = await fetch("/api/battle/turn", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, walletAddress, round: state.round, action }),
        });
        const data = await res.json();
        if (res.status === 409) {
          await refresh();
          return;
        }
        if (!res.ok) {
          setError(data.error === "invalid_action" || data.error === "invalid_swap" ? "That move isn't available right now." : "Something went wrong. Try again.");
          return;
        }
        onResponseRef.current(data as TurnResponse<S>);
      } catch {
        if (mounted.current) setError("Network error. Try again.");
      } finally {
        if (mounted.current) setBusy(false);
      }
    },
    [busy, refresh, sessionId, state.round, walletAddress]
  );

  return { state, setState, busy, error, send };
}
