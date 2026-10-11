"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useGame } from "@/components/GameProvider";
import { PixelSprite } from "@/components/PixelSprite";
import { synergyLabel } from "@/components/tactical/synergyLabel";
import { useUnifiedWallet } from "@/hooks/useUnifiedWallet";
import { SQUAD_SIZE } from "@/lib/tactical/constants";
import { synergyFor } from "@/lib/tactical/squad";

const SLOT_NAMES = ["Lead", "Second", "Anchor"];

export default function SquadBuilderPage() {
  const { player, agents, loading } = useGame();
  const { publicKey } = useUnifiedWallet();
  const router = useRouter();
  const [slots, setSlots] = useState<(string | null)[]>([null, null, null]);
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!loading && !player) router.push("/");
  }, [loading, player, router]);

  useEffect(() => {
    if (!publicKey) return;
    fetch(`/api/squad?wallet=${encodeURIComponent(publicKey.toBase58())}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const ids: string[] | undefined = data?.saved ?? data?.squad?.map((a: { id: string }) => a.id);
        if (ids?.length === SQUAD_SIZE) setSlots(ids);
      })
      .catch(() => {});
  }, [publicKey]);

  if (loading || !player) return null;

  const byId = new Map(agents.map((a) => [a.id, a]));
  const chosen = slots.map((id) => (id ? byId.get(id) ?? null : null));
  const full = chosen.every(Boolean);
  const synergy = full ? synergyFor(chosen.map((a) => a!.role)) : null;

  function toggle(agentId: string) {
    setStatus(null);
    setSlots((prev) => {
      const idx = prev.indexOf(agentId);
      if (idx >= 0) return prev.map((id, i) => (i === idx ? null : id));
      const empty = prev.indexOf(null);
      if (empty < 0) return prev;
      return prev.map((id, i) => (i === empty ? agentId : id));
    });
  }

  async function save() {
    if (!publicKey || !full) return;
    setSaving(true);
    try {
      const res = await fetch("/api/squad", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: publicKey.toBase58(), agentIds: slots }),
      });
      setStatus(res.ok ? "Squad saved!" : "Couldn't save that squad.");
    } catch {
      setStatus("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-gray-950 text-white p-6 pb-32 max-w-2xl mx-auto">
      <Link href="/battle" className="text-sm text-gray-500 font-mono hover:text-gray-400 mb-4 block">
        &larr; Back to battle
      </Link>
      <h1 className="text-2xl font-mono font-bold mb-1 text-center">Squad Builder</h1>
      <p className="font-mono text-xs text-gray-500 text-center mb-6">Pick 3 agents. Order matters: the Lead fights first.</p>

      {agents.length < SQUAD_SIZE ? (
        <div className="text-center space-y-2">
          <p className="font-mono text-sm text-gray-400">You need at least 3 agents to form a squad.</p>
          <Link href="/summon" className="text-purple-400 font-mono text-sm">
            Summon more agents →
          </Link>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2 mb-3">
            {chosen.map((a, i) => (
              <button
                key={i}
                type="button"
                onClick={() => a && toggle(a.id)}
                className={`border rounded-lg p-3 text-center min-h-[110px] ${a ? "border-emerald-500 bg-emerald-900/20" : "border-dashed border-gray-700"}`}
              >
                <p className="font-mono text-[10px] text-gray-500">{SLOT_NAMES[i]}</p>
                {a ? (
                  <>
                    <div className="flex justify-center">
                      <PixelSprite spriteSeed={a.spriteSeed as Record<string, number>} role={a.role} size={48} />
                    </div>
                    <p className="font-mono text-xs truncate">{a.name}</p>
                  </>
                ) : (
                  <p className="font-mono text-xs text-gray-600 mt-6">empty</p>
                )}
              </button>
            ))}
          </div>
          <p className="text-center font-mono text-sm text-emerald-300 h-5 mb-4">{synergy ? synergyLabel(synergy) : ""}</p>

          <div className="grid grid-cols-3 gap-2 mb-6">
            {agents.map((a) => {
              const picked = slots.includes(a.id);
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => toggle(a.id)}
                  className={`border rounded-lg p-2 text-center ${picked ? "border-emerald-500 bg-emerald-900/20" : "border-gray-700 bg-gray-900"}`}
                >
                  <div className="flex justify-center">
                    <PixelSprite spriteSeed={a.spriteSeed as Record<string, number>} role={a.role} size={40} />
                  </div>
                  <p className="font-mono text-[11px] truncate">{a.name}</p>
                  <p className="font-mono text-[9px] text-gray-500">{a.role}</p>
                </button>
              );
            })}
          </div>

          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={save}
              disabled={!full || saving}
              className="px-6 py-2.5 min-h-[44px] bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-mono font-bold text-sm rounded-lg"
            >
              {saving ? "Saving…" : "Save Squad"}
            </button>
            {status && <p className="font-mono text-xs text-gray-300">{status}</p>}
          </div>
        </>
      )}
    </main>
  );
}
