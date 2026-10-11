"use client";
import { useState } from "react";
import { PixelSprite } from "@/components/PixelSprite";
import type { ItemKind, ShopItem } from "@/lib/shop/catalog";
import { newPurchaseId, SHOP_ERRORS } from "@/lib/shop-client";
import type { Agent } from "@/lib/types";
import { AURA_SWATCH } from "./cosmeticStyle";

const GROUPS: { title: string; kinds: ItemKind[] }[] = [
  { title: "🧪 Elixirs — permanent stats", kinds: ["elixir"] },
  { title: "📜 Boosts", kinds: ["scroll"] },
  { title: "⚡ Refills & Tickets", kinds: ["refill", "ticket"] },
  { title: "✨ Cosmetics", kinds: ["aura", "namecolor", "title"] },
];

interface ShopItemsProps {
  items: ShopItem[];
  balance: number;
  agents: Agent[];
  walletAddress: string;
  onBalance: (balance: number) => void;
}

export function ShopItems({ items, balance, agents, walletAddress, onBalance }: ShopItemsProps) {
  const [picking, setPicking] = useState<ShopItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);

  async function buy(item: ShopItem, agentId?: string) {
    setPicking(null);
    setBusy(true);
    setToast(null);
    try {
      const res = await fetch("/api/shop/buy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress, itemId: item.id, agentId, purchaseId: newPurchaseId() }),
      });
      const data = await res.json();
      if (typeof data.balance === "number") onBalance(data.balance);
      if (!res.ok) {
        setToast({ ok: false, text: SHOP_ERRORS[data.error] ?? "Purchase failed. Please try again." });
        return;
      }
      const agentName = agents.find((a) => a.id === agentId)?.name;
      setToast({ ok: true, text: `${item.name}${agentName ? ` → ${agentName}` : ""}: ${data.effect ?? "done"}` });
    } catch {
      setToast({ ok: false, text: SHOP_ERRORS.network });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      {toast && (
        <div role="status" className={`px-3 py-2 rounded font-mono text-xs border ${toast.ok ? "border-emerald-700 bg-emerald-900/30 text-emerald-200" : "border-red-700 bg-red-900/20 text-red-300"}`}>
          {toast.text}
        </div>
      )}
      {GROUPS.map((g) => (
        <section key={g.title}>
          <h2 className="font-mono text-sm font-bold text-gray-200 mb-2">{g.title}</h2>
          <div className="grid grid-cols-2 gap-2">
            {items
              .filter((i) => g.kinds.includes(i.kind))
              .map((item) => (
                <div key={item.id} className="border border-gray-800 bg-gray-900 rounded-lg p-3 flex flex-col">
                  <div className="flex items-center gap-1.5">
                    {item.kind === "aura" && <span className="w-3 h-3 rounded-full" style={{ background: AURA_SWATCH[item.value!] }} aria-hidden="true" />}
                    <span className="font-mono text-xs font-bold text-white">{item.name}</span>
                  </div>
                  <p className="font-mono text-[10px] text-gray-400 mt-1 flex-1">{item.description}</p>
                  <button
                    type="button"
                    aria-label={`Buy ${item.name} for ${item.price} gems`}
                    disabled={busy || balance < item.price}
                    onClick={() => (item.target === "agent" ? setPicking(item) : buy(item))}
                    className="mt-2 min-h-[40px] rounded bg-purple-700 hover:bg-purple-600 disabled:opacity-40 font-mono text-xs font-bold text-white"
                  >
                    💎 {item.price}
                  </button>
                </div>
              ))}
          </div>
        </section>
      ))}

      {picking && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-end sm:items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={`Choose an agent for ${picking.name}`}>
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-4 w-full max-w-sm max-h-[80vh] overflow-y-auto">
            <h3 className="font-mono font-bold text-white text-sm mb-1">{picking.name}</h3>
            <p className="font-mono text-[11px] text-gray-400 mb-3">
              Choose an agent · 💎 {picking.price} · balance after: {balance - picking.price}
            </p>
            {agents.length === 0 ? (
              <p className="font-mono text-xs text-gray-500">Summon an agent first.</p>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {agents.map((a) => (
                  <button key={a.id} type="button" onClick={() => buy(picking, a.id)} className="border border-gray-700 rounded-lg p-2 hover:border-purple-500">
                    <div className="flex justify-center">
                      <PixelSprite spriteSeed={a.spriteSeed as Record<string, number>} role={a.role} size={40} />
                    </div>
                    <span className="block font-mono text-[10px] text-white truncate">{a.name}</span>
                  </button>
                ))}
              </div>
            )}
            <button type="button" onClick={() => setPicking(null)} className="mt-3 w-full min-h-[40px] font-mono text-xs text-gray-400">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
