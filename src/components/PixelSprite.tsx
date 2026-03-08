"use client";
import { useRef, useEffect } from "react";
import { generateSpriteData } from "@/lib/sprite-renderer";
import type { RoleCategory } from "@/lib/types";

interface PixelSpriteProps {
  spriteSeed: Record<string, number>;
  role: RoleCategory;
  size?: number;
}

export function PixelSprite({ spriteSeed, role, size = 80 }: PixelSpriteProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const grid = generateSpriteData(spriteSeed as any, role);

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
  }, [spriteSeed, role]);

  return (
    <canvas
      ref={canvasRef}
      width={32}
      height={32}
      style={{ width: size, height: size, imageRendering: "pixelated" }}
      className="rounded"
    />
  );
}
