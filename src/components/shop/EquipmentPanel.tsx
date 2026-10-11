"use client";
import { useState } from "react";
import { GEAR_SLOTS, gearTier, gearUpgradeCost, type Gear, type GearSlot } from "@/lib/shop/catalog";
import { ROLE_CATEGORY } from "@/lib/tactical/constants";
import { newPurchaseId, SHOP_ERRORS } from "@/lib/shop-client";
import type { RoleCategory } from "@/lib/types";
import { TIER_COLOR } from "./gearStyle";

const SLOT_INFO: Record<GearSlot, { name: string; icon: string }> = {
  weapon: { name: "Weapon", icon: "🗡" },
  armor: { name: "Armor", icon: "🛡" },
  relic: { name: "Relic", icon: "🔮" },
};

function bonusText(slot: GearSlot, level: number, role: RoleCategory): string {
  if (slot === "weapon") return `+${3 * level} ${ROLE_CATEGORY[role]}`;
  if (slot === "armor") return `+${level} all categories`;
  return `+${2 * level} Speed, +${level} Social`;
}

interface EquipmentPanelProps {
  agentId: string;
  role: RoleCategory;
  gear: Gear;
  /** Owner's wallet; null shows gear read-only. */
  walletAddress: string | null;
  onUpgraded: (gear: Gear, balance: number) => void;
}

export function EquipmentPanel({ agentId, role, gear, walletAddress, onUpgraded }: EquipmentPanelProps) {
  const [busy, setBusy] = useState<GearSlot | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function upgrade(slot: GearSlot) {
    if (!walletAddress) return;
    setBusy(slot);
    setError(null);
    try {
      const res = await fetch("/api/shop/gear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress, agentId, slot, purchaseId: newPurchaseId() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error === "upgrade_conflict" ? "Someone upgraded this slot at the same time; you were refunded." : SHOP_ERRORS[data.error] ?? "Upgrade failed.");
        return;
      }
      onUpgraded({ ...gear, [slot]: data.level }, data.balance);
    } catch {
      setError(SHOP_ERRORS.network);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded p-4">
      <h2 className="text-lg font-mono font-bold mb-3">Equipment</h2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {GEAR_SLOTS.map((slot) => {
          const level = gear[slot] ?? 0;
          const tier = gearTier(level);
          const info = SLOT_INFO[slot];
          return (
            <div key={slot} role="group" aria-label={info.name} className="border border-gray-700 rounded-lg p-3">
              <div className="flex items-center justify-between font-mono">
                <span className="text-sm font-bold text-white">
                  {info.icon} {info.name}
                </span>
                {tier && (
                  <span className="text-[10px] px-1.5 rounded border capitalize" style={{ color: TIER_COLOR[tier], borderColor: TIER_COLOR[tier] }}>
                    {tier}
                  </span>
                )}
              </div>
              <p className="font-mono text-xs text-gray-300 mt-1">{level ? `Lv ${level} · ${bonusText(slot, level, role)}` : "No gear"}</p>
              {walletAddress && (
                <button
                  type="button"
                  aria-label={`Upgrade ${info.name} for ${gearUpgradeCost(level + 1)} gems`}
                  disabled={busy !== null}
                  onClick={() => upgrade(slot)}
                  className="mt-2 w-full min-h-[40px] rounded bg-purple-700 hover:bg-purple-600 disabled:opacity-40 font-mono text-xs font-bold text-white"
                >
                  {busy === slot ? "Upgrading…" : `${level ? "Upgrade" : "Craft"} → Lv ${level + 1} · 💎 ${gearUpgradeCost(level + 1)}`}
                </button>
              )}
            </div>
          );
        })}
      </div>
      {error && <p role="status" className="mt-2 font-mono text-xs text-red-300">{error}</p>}
    </div>
  );
}
