import type { ReactNode } from "react";
import { PixelSprite } from "@/components/PixelSprite";
import type { AgentWithDimensions } from "@/lib/types";
import { HpBar } from "./HpBar";
import { weaponTint } from "@/components/shop/gearStyle";

interface FighterColumnProps {
  agent: AgentWithDimensions | undefined;
  hp: number;
  maxHp: number;
  /** Damage taken in the round on screen (shakes the sprite and floats the number). */
  damage?: number;
  align?: "left" | "right";
  size?: number;
  children?: ReactNode;
}

/** Sprite + HP bar for one side of a battle; extra rows (focus, synergy) go in children. */
export function FighterColumn({ agent, hp, maxHp, damage, align = "left", size = 72, children }: FighterColumnProps) {
  return (
    <div className="space-y-1">
      <div className={`flex justify-center ${damage ? "animate-shakeHit" : ""}`}>
        {agent && <PixelSprite spriteSeed={agent.spriteSeed as Record<string, number>} role={agent.role} size={size} weaponTint={weaponTint(agent.gear)} />}
      </div>
      <HpBar name={agent?.name ?? ""} hp={hp} maxHp={maxHp} align={align} floater={damage || null} />
      {children}
    </div>
  );
}
