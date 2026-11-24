"use client";
import { useRef, useEffect } from "react";
import { generateSpriteData, type SpriteSeed } from "@/lib/sprite-renderer";
import type { RoleCategory } from "@/lib/types";

interface PixelSpriteProps {
  spriteSeed: Record<string, number>;
  role: RoleCategory;
  size?: number;
  /** Gear tier colour for the weapon pixels. */
  weaponTint?: string;
  /** Shiny variant (`isShiny(agent.id)`): alternate palette, sparkles and a soft gold glow. */
  shiny?: boolean;
}

export function PixelSprite({ spriteSeed, role, size = 80, weaponTint, shiny = false }: PixelSpriteProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const grid = generateSpriteData(spriteSeed as unknown as SpriteSeed, role, weaponTint, shiny);

    ctx.clearRect(0, 0, 32, 32);

    for (let y = 0; y < 32; y++) {
      for (let x = 0; x < 32; x++) {
        const color = grid[y][x];
        if (color) {
          ctx.fillStyle = color;
          ctx.fillRect(x, y, 1, 1);
        }
      }
    }
  }, [spriteSeed, role, weaponTint, shiny]);

  return (
    <canvas
      ref={canvasRef}
      width={32}
      height={32}
      style={{
        width: size,
        height: size,
        imageRendering: "pixelated",
        filter: shiny ? "drop-shadow(0 0 4px rgba(250, 204, 21, 0.55))" : undefined,
      }}
      className="rounded"
      aria-label={shiny ? "Shiny agent" : undefined}
    />
  );
}
