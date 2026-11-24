"use client";
import { useCallback, useEffect, useState } from "react";
import { EVOLUTION_BONUS, EVOLUTIONS, EVOLVE_AT, evolutionPath, evolutionProgress, SIGNATURE_AT, SIGNATURE_MULT, signatureMove } from "@/lib/evolution";
import { ROLE_CATEGORY } from "@/lib/tactical/constants";
import type { AgentWithDimensions } from "@/lib/types";

const ERRORS: Record<string, string> = {
  not_ready: `Not ready yet: the role category must average ${EVOLVE_AT}.`,
  already_evolved: "This agent has already evolved.",
  not_owner: "Only the owner can evolve this agent.",
};

interface EvolutionPanelProps {
  agent: AgentWithDimensions;
  /** The owner's wallet; null for visitors (read-only). */
  walletAddress: string | null;
}

/** Class evolution (choose a path once) and the agent's signature move. */
export function EvolutionPanel({ agent, walletAddress }: EvolutionPanelProps) {
  const [path, setPath] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/agents/${agent.id}/evolution`);
      setPath(res.ok ? ((await res.json()) as { path: string | null }).path : null);
    } catch {
      setPath(null);
    }
  }, [agent.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    load();
  }, [load]);

  const evolve = async (id: string) => {
    if (!walletAddress) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/agents/${agent.id}/evolution`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress, path: id }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) setPath(data.path);
      else setError(ERRORS[data.error] ?? "Something went wrong. Please try again.");
    } catch {
      setError("Network error. Please try again.");
    }
    setConfirm(null);
    setBusy(false);
  };

  const progress = evolutionProgress(agent);
  const chosen = evolutionPath(agent.role, path);
  const signature = signatureMove(agent);
  const category = ROLE_CATEGORY[agent.role];
  const pct = Math.min(100, Math.round((progress.average / EVOLVE_AT) * 100));

  return (
    <section className="bg-gray-900 border border-gray-800 rounded p-4 space-y-4" aria-labelledby="evo-h">
      <h2 id="evo-h" className="text-lg font-mono font-bold">
        Class Evolution
      </h2>

      {path === undefined ? (
        <p className="font-mono text-xs text-gray-500">Loading…</p>
      ) : chosen ? (
        <div className="border border-yellow-600/60 bg-yellow-900/20 rounded p-3">
          <p className="font-mono text-sm font-bold text-yellow-300">✦ {chosen.name}</p>
          <p className="font-mono text-xs text-gray-300">{chosen.blurb}</p>
          <p className="font-mono text-[11px] text-gray-400 mt-1">
            +{Math.round(EVOLUTION_BONUS * 100)}% {chosen.categories.join(" and ")} in battle.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <div className="flex justify-between font-mono text-[11px] text-gray-400">
              <span>{category} average</span>
              <span>
                {progress.average} / {EVOLVE_AT}
              </span>
            </div>
            <div className="h-2 bg-gray-800 rounded mt-1" role="progressbar" aria-valuemin={0} aria-valuemax={EVOLVE_AT} aria-valuenow={progress.average} aria-label="Evolution progress">
              <div className="h-2 bg-yellow-500 rounded" style={{ width: `${pct}%` }} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {EVOLUTIONS[agent.role].map((p) => (
              <div key={p.id} className="border border-gray-700 rounded p-3 space-y-1">
                <p className="font-mono text-sm font-bold text-white">{p.name}</p>
                <p className="font-mono text-[11px] text-gray-400">{p.blurb}</p>
                <p className="font-mono text-[11px] text-yellow-300">
                  +{Math.round(EVOLUTION_BONUS * 100)}% {p.categories.join(" & ")}
                </p>
                {walletAddress &&
                  (confirm === p.id ? (
                    <div className="flex gap-2 pt-1">
                      <button className="flex-1 py-1 rounded bg-yellow-600 hover:bg-yellow-500 font-mono text-xs font-bold disabled:opacity-40" disabled={busy} onClick={() => evolve(p.id)}>
                        Confirm (permanent)
                      </button>
                      <button className="px-2 py-1 rounded bg-gray-700 font-mono text-xs" disabled={busy} onClick={() => setConfirm(null)}>
                        Back
                      </button>
                    </div>
                  ) : (
                    <button
                      className="w-full py-1 rounded bg-gray-800 hover:bg-gray-700 font-mono text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed"
                      disabled={busy || !progress.ready}
                      onClick={() => setConfirm(p.id)}
                    >
                      {progress.ready ? `Evolve into ${p.name}` : "Not ready yet"}
                    </button>
                  ))}
              </div>
            ))}
          </div>
          {error && (
            <p className="font-mono text-xs text-red-400" role="alert">
              {error}
            </p>
          )}
        </div>
      )}

      <div className="border-t border-gray-800 pt-3">
        <h3 className="font-mono text-sm font-bold">Signature Move</h3>
        {signature ? (
          <p className="font-mono text-xs text-gray-300">
            <span className="text-yellow-300 font-bold">✦ {signature.name}</span> replaces the special, hitting {Math.round((SIGNATURE_MULT - 1) * 100)}% harder.
          </p>
        ) : (
          <p className="font-mono text-xs text-gray-500">Raise any dimension to {SIGNATURE_AT} to unlock a signature move named after it.</p>
        )}
      </div>
    </section>
  );
}
