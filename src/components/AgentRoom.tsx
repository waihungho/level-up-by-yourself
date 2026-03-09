"use client";

import { useRef, useEffect, useCallback } from "react";
import { generateSpriteData } from "@/lib/sprite-renderer";
import type { Agent } from "@/lib/types";

// --- Constants ---
const TILE_W = 32;
const TILE_H = 16;
const GRID_SIZE = 8;
const WALL_HEIGHT = 24;
const CANVAS_HEIGHT = 320;
const SPRITE_SIZE = 32;

// Floor colors
const TILE_DARK = "#1a1a2e";
const TILE_LIGHT = "#16162a";
const GRID_LINE = "rgba(255,255,255,0.04)";

// Wall colors
const WALL_FACE = "#222244";
const WALL_TOP = "#2a2a50";

// Shadow
const SHADOW_COLOR = "rgba(0,0,0,0.35)";

// Movement
const MIN_SPEED = 0.6; // tiles/sec
const MAX_SPEED = 1.0;
const MIN_PAUSE = 1000; // ms
const MAX_PAUSE = 3000;

// --- Internal wandering state per agent ---
interface WanderState {
  /** Current grid position (fractional) */
  gx: number;
  gy: number;
  /** Target grid tile */
  targetGx: number;
  targetGy: number;
  /** Speed in tiles/sec */
  speed: number;
  /** If paused, when the pause ends (timestamp ms) */
  pauseUntil: number;
  /** Cached sprite pixel grid */
  sprite: (string | null)[][];
}

function isoToScreen(
  gx: number,
  gy: number,
  offsetX: number,
  offsetY: number,
): { sx: number; sy: number } {
  return {
    sx: (gx - gy) * (TILE_W / 2) + offsetX,
    sy: (gx + gy) * (TILE_H / 2) + offsetY,
  };
}

function pickRandomTile(): { gx: number; gy: number } {
  return {
    gx: Math.random() * (GRID_SIZE - 1) + 0.5,
    gy: Math.random() * (GRID_SIZE - 1) + 0.5,
  };
}

function randomSpeed(): number {
  return MIN_SPEED + Math.random() * (MAX_SPEED - MIN_SPEED);
}

function randomPause(): number {
  return MIN_PAUSE + Math.random() * (MAX_PAUSE - MIN_PAUSE);
}

// --- Drawing helpers ---

function drawFloor(
  ctx: CanvasRenderingContext2D,
  offsetX: number,
  offsetY: number,
) {
  for (let gx = 0; gx < GRID_SIZE; gx++) {
    for (let gy = 0; gy < GRID_SIZE; gy++) {
      const isEven = (gx + gy) % 2 === 0;
      const { sx, sy } = isoToScreen(gx, gy, offsetX, offsetY);

      // Diamond tile
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + TILE_W / 2, sy + TILE_H / 2);
      ctx.lineTo(sx, sy + TILE_H);
      ctx.lineTo(sx - TILE_W / 2, sy + TILE_H / 2);
      ctx.closePath();

      ctx.fillStyle = isEven ? TILE_DARK : TILE_LIGHT;
      ctx.fill();

      // Grid line
      ctx.strokeStyle = GRID_LINE;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
}

function drawWalls(
  ctx: CanvasRenderingContext2D,
  offsetX: number,
  offsetY: number,
) {
  // Top-right wall (gx=0 edge, gy goes 0..GRID_SIZE)
  for (let gy = 0; gy < GRID_SIZE; gy++) {
    const { sx, sy } = isoToScreen(0, gy, offsetX, offsetY);

    // Wall face
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx - TILE_W / 2, sy + TILE_H / 2);
    ctx.lineTo(sx - TILE_W / 2, sy + TILE_H / 2 - WALL_HEIGHT);
    ctx.lineTo(sx, sy - WALL_HEIGHT);
    ctx.closePath();
    ctx.fillStyle = WALL_FACE;
    ctx.fill();

    // Wall top highlight
    ctx.beginPath();
    ctx.moveTo(sx, sy - WALL_HEIGHT);
    ctx.lineTo(sx - TILE_W / 2, sy + TILE_H / 2 - WALL_HEIGHT);
    ctx.lineWidth = 1;
    ctx.strokeStyle = WALL_TOP;
    ctx.stroke();
  }

  // Top-left wall (gy=0 edge, gx goes 0..GRID_SIZE)
  for (let gx = 0; gx < GRID_SIZE; gx++) {
    const { sx, sy } = isoToScreen(gx, 0, offsetX, offsetY);

    // Wall face
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + TILE_W / 2, sy + TILE_H / 2);
    ctx.lineTo(sx + TILE_W / 2, sy + TILE_H / 2 - WALL_HEIGHT);
    ctx.lineTo(sx, sy - WALL_HEIGHT);
    ctx.closePath();
    ctx.fillStyle = WALL_FACE;
    ctx.fill();

    // Wall top highlight
    ctx.beginPath();
    ctx.moveTo(sx, sy - WALL_HEIGHT);
    ctx.lineTo(sx + TILE_W / 2, sy + TILE_H / 2 - WALL_HEIGHT);
    ctx.lineWidth = 1;
    ctx.strokeStyle = WALL_TOP;
    ctx.stroke();
  }
}

function drawShadow(
  ctx: CanvasRenderingContext2D,
  screenX: number,
  screenY: number,
) {
  ctx.save();
  ctx.fillStyle = SHADOW_COLOR;
  ctx.beginPath();
  ctx.ellipse(screenX, screenY + 2, 8, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawSprite(
  ctx: CanvasRenderingContext2D,
  sprite: (string | null)[][],
  screenX: number,
  screenY: number,
) {
  // Position so feet are at screenX, screenY.
  // Sprite is 32x32. Feet are at bottom-center, so offset by (-16, -32).
  const ox = Math.round(screenX - SPRITE_SIZE / 2);
  const oy = Math.round(screenY - SPRITE_SIZE);

  for (let y = 0; y < SPRITE_SIZE; y++) {
    for (let x = 0; x < SPRITE_SIZE; x++) {
      const color = sprite[y][x];
      if (color) {
        ctx.fillStyle = color;
        ctx.fillRect(ox + x, oy + y, 1, 1);
      }
    }
  }
}

// --- Component ---

interface AgentRoomProps {
  agents: Agent[];
}

export function AgentRoom({ agents }: AgentRoomProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wanderRef = useRef<Map<string, WanderState>>(new Map());
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);

  // Sync wander states with agents list
  const syncWanderStates = useCallback(() => {
    const map = wanderRef.current;
    const agentIds = new Set(agents.map((a) => a.id));

    // Remove stale
    for (const id of map.keys()) {
      if (!agentIds.has(id)) map.delete(id);
    }

    // Add new
    for (const agent of agents) {
      if (!map.has(agent.id)) {
        const start = pickRandomTile();
        const target = pickRandomTile();
        map.set(agent.id, {
          gx: start.gx,
          gy: start.gy,
          targetGx: target.gx,
          targetGy: target.gy,
          speed: randomSpeed(),
          pauseUntil: 0,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          sprite: generateSpriteData(agent.spriteSeed as any, agent.role),
        });
      }
    }
  }, [agents]);

  useEffect(() => {
    if (agents.length === 0) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    syncWanderStates();

    // ResizeObserver for responsive width
    const parent = canvas.parentElement;
    let canvasWidth = parent?.clientWidth ?? 480;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        canvasWidth = entry.contentRect.width;
        canvas.width = canvasWidth;
        canvas.height = CANVAS_HEIGHT;
      }
    });

    if (parent) {
      resizeObserver.observe(parent);
      canvasWidth = parent.clientWidth;
    }
    canvas.width = canvasWidth;
    canvas.height = CANVAS_HEIGHT;

    const tick = (timestamp: number) => {
      if (!lastTimeRef.current) lastTimeRef.current = timestamp;
      const dt = (timestamp - lastTimeRef.current) / 1000; // seconds
      lastTimeRef.current = timestamp;

      // Update wander states
      const map = wanderRef.current;
      for (const state of map.values()) {
        if (timestamp < state.pauseUntil) continue;

        const dx = state.targetGx - state.gx;
        const dy = state.targetGy - state.gy;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 0.05) {
          // Arrived — pause then pick new target
          state.gx = state.targetGx;
          state.gy = state.targetGy;
          state.pauseUntil = timestamp + randomPause();
          const next = pickRandomTile();
          state.targetGx = next.gx;
          state.targetGy = next.gy;
          state.speed = randomSpeed();
        } else {
          const step = Math.min(state.speed * dt, dist);
          state.gx += (dx / dist) * step;
          state.gy += (dy / dist) * step;
        }
      }

      // Clear
      ctx.clearRect(0, 0, canvasWidth, CANVAS_HEIGHT);

      const offsetX = canvasWidth / 2;
      // Push the floor down enough to show walls + some margin
      const offsetY = WALL_HEIGHT + 40;

      // Draw walls behind the floor
      drawWalls(ctx, offsetX, offsetY);

      // Draw floor
      drawFloor(ctx, offsetX, offsetY);

      // Collect agents for depth sorting
      const sorted: { state: WanderState; depth: number }[] = [];
      for (const state of map.values()) {
        sorted.push({ state, depth: state.gx + state.gy });
      }
      sorted.sort((a, b) => a.depth - b.depth);

      // Draw agents back-to-front
      for (const { state } of sorted) {
        const { sx, sy } = isoToScreen(
          state.gx,
          state.gy,
          offsetX,
          offsetY,
        );
        drawShadow(ctx, sx, sy);
        drawSprite(ctx, state.sprite, sx, sy);
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafRef.current);
      lastTimeRef.current = 0;
      resizeObserver.disconnect();
    };
  }, [agents, syncWanderStates]);

  if (agents.length === 0) return null;

  return (
    <canvas
      ref={canvasRef}
      height={CANVAS_HEIGHT}
      style={{
        width: "100%",
        height: CANVAS_HEIGHT,
        imageRendering: "pixelated",
      }}
    />
  );
}
