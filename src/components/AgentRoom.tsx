"use client";

import { useRef, useEffect } from "react";
import { generateSpriteData } from "@/lib/sprite-renderer";
import type { Agent } from "@/lib/types";

// --- Constants ---
const TILE_W = 64;
const TILE_H = 32;
const GRID_SIZE = 8;
const WALL_HEIGHT = 36;
const CANVAS_HEIGHT = 310;
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

// Sprite scale (2x = 64px rendered from 32px source)
const SPRITE_SCALE = 2;

// Movement
const MIN_SPEED = 0.15; // tiles/sec
const MAX_SPEED = 0.3;
const SMOOTHING = 1.5; // lerp factor — higher = snappier, lower = smoother
const MIN_PAUSE = 2000; // ms
const MAX_PAUSE = 6000;
const MAX_INITIAL_DELAY = 5000; // stagger start so agents don't all move at once

// Walk animation
const WALK_CYCLE_SPEED = 3; // frames per second for walk cycle

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
  /** Pre-rendered sprite canvas (32x32) for fast drawImage */
  spriteCanvas: OffscreenCanvas;
  /** Walk animation phase accumulator */
  walkTime: number;
  /** Whether currently walking */
  isWalking: boolean;
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

const MIN_AGENT_DIST = 1.2; // minimum grid distance between stopped agents

function pickRandomTile(): { gx: number; gy: number } {
  return {
    gx: Math.random() * (GRID_SIZE - 1) + 0.5,
    gy: Math.random() * (GRID_SIZE - 1) + 0.5,
  };
}

/** Pick a random tile that doesn't overlap with other agents' targets/positions */
function pickNonOverlappingTile(
  others: WanderState[],
  maxAttempts = 20,
): { gx: number; gy: number } {
  for (let i = 0; i < maxAttempts; i++) {
    const candidate = pickRandomTile();
    const tooClose = others.some((o) => {
      // Check against both current position and target
      const dxCur = candidate.gx - o.gx;
      const dyCur = candidate.gy - o.gy;
      const dxTgt = candidate.gx - o.targetGx;
      const dyTgt = candidate.gy - o.targetGy;
      return (
        Math.sqrt(dxCur * dxCur + dyCur * dyCur) < MIN_AGENT_DIST ||
        Math.sqrt(dxTgt * dxTgt + dyTgt * dyTgt) < MIN_AGENT_DIST
      );
    });
    if (!tooClose) return candidate;
  }
  // Fallback: just pick anywhere
  return pickRandomTile();
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
  ctx.ellipse(screenX, screenY + 4, 18, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// Build an OffscreenCanvas from sprite data
function buildSpriteCanvas(sprite: (string | null)[][]): OffscreenCanvas {
  const oc = new OffscreenCanvas(SPRITE_SIZE, SPRITE_SIZE);
  const octx = oc.getContext("2d")!;
  for (let y = 0; y < SPRITE_SIZE; y++) {
    for (let x = 0; x < SPRITE_SIZE; x++) {
      const color = sprite[y][x];
      if (color) {
        octx.fillStyle = color;
        octx.fillRect(x, y, 1, 1);
      }
    }
  }
  return oc;
}

function drawSprite(
  ctx: CanvasRenderingContext2D,
  spriteCanvas: OffscreenCanvas,
  sprite: (string | null)[][],
  screenX: number,
  screenY: number,
  walkFrame: number, // 0=standing, 1-3=walk cycle frames
) {
  const rendered = SPRITE_SIZE * SPRITE_SCALE;
  const ox = Math.round(screenX - rendered / 2);
  const oy = Math.round(screenY - rendered);

  if (walkFrame === 0) {
    // Standing: use pre-rendered canvas for fast, crisp drawing
    ctx.drawImage(spriteCanvas, ox, oy, rendered, rendered);
    return;
  }

  // Walking: draw with leg animation pixel-by-pixel
  const legTop = 22;
  const legBottom = 28;
  const spriteCx = 15;

  for (let y = 0; y < SPRITE_SIZE; y++) {
    for (let x = 0; x < SPRITE_SIZE; x++) {
      const color = sprite[y][x];
      if (color) {
        let yOffset = 0;

        // Leg animation
        if (y >= legTop && y <= legBottom) {
          const isLeftLeg = x < spriteCx;
          if (walkFrame === 1) {
            yOffset = isLeftLeg ? -1 : 1;
          } else if (walkFrame === 3) {
            yOffset = isLeftLeg ? 1 : -1;
          }
        }

        // Body bob
        if (y < legTop && (walkFrame === 1 || walkFrame === 3)) {
          yOffset = -1;
        }

        ctx.fillStyle = color;
        ctx.fillRect(
          ox + x * SPRITE_SCALE,
          oy + (y + yOffset) * SPRITE_SCALE,
          SPRITE_SCALE,
          SPRITE_SCALE,
        );
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

  // Keep a ref to agents so the animation loop can read it without depending on it
  const agentsRef = useRef<Agent[]>(agents);
  agentsRef.current = agents;

  // Sync wander states when agents list changes
  useEffect(() => {
    const map = wanderRef.current;
    const agentIds = new Set(agents.map((a) => a.id));

    // Remove stale
    for (const id of map.keys()) {
      if (!agentIds.has(id)) map.delete(id);
    }

    // Add new
    for (const agent of agents) {
      if (!map.has(agent.id)) {
        const others = [...map.values()];
        const start = pickNonOverlappingTile(others);
        const target = pickNonOverlappingTile(others);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const spriteData = generateSpriteData(agent.spriteSeed as any, agent.role);
        map.set(agent.id, {
          gx: start.gx,
          gy: start.gy,
          targetGx: target.gx,
          targetGy: target.gy,
          speed: randomSpeed(),
          pauseUntil: performance.now() + Math.random() * MAX_INITIAL_DELAY,
          sprite: spriteData,
          spriteCanvas: buildSpriteCanvas(spriteData),
          walkTime: 0,
          isWalking: false,
        });
      }
    }
  }, [agents]);

  // Animation loop — runs once, reads from refs
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // ResizeObserver for responsive width
    const parent = canvas.parentElement;
    let canvasWidth = parent?.clientWidth ?? 480;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        canvasWidth = entry.contentRect.width;
        canvas.width = canvasWidth;
        canvas.height = CANVAS_HEIGHT;
        ctx.imageSmoothingEnabled = false;
      }
    });

    if (parent) {
      resizeObserver.observe(parent);
      canvasWidth = parent.clientWidth;
    }
    canvas.width = canvasWidth;
    canvas.height = CANVAS_HEIGHT;
    ctx.imageSmoothingEnabled = false;

    const tick = (timestamp: number) => {
      if (!lastTimeRef.current) lastTimeRef.current = timestamp;
      const dt = Math.min((timestamp - lastTimeRef.current) / 1000, 0.1); // cap to prevent teleporting
      lastTimeRef.current = timestamp;

      // Update wander states
      const map = wanderRef.current;
      for (const state of map.values()) {
        if (timestamp < state.pauseUntil) {
          state.isWalking = false;
          state.walkTime = 0;
          continue;
        }

        const dx = state.targetGx - state.gx;
        const dy = state.targetGy - state.gy;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 0.05) {
          // Arrived — pause then pick new target that doesn't overlap others
          state.gx = state.targetGx;
          state.gy = state.targetGy;
          state.pauseUntil = timestamp + randomPause();
          const others = [...map.values()].filter((s) => s !== state);
          const next = pickNonOverlappingTile(others);
          state.targetGx = next.gx;
          state.targetGy = next.gy;
          state.speed = randomSpeed();
          state.isWalking = false;
          state.walkTime = 0;
        } else {
          // Smooth lerp: ease toward target, slow down as approaching
          const lerpFactor = 1 - Math.exp(-SMOOTHING * state.speed * dt);
          state.gx += dx * lerpFactor;
          state.gy += dy * lerpFactor;
          state.isWalking = true;
          state.walkTime += dt;
        }
      }

      // Clear
      ctx.clearRect(0, 0, canvasWidth, CANVAS_HEIGHT);

      const offsetX = canvasWidth / 2;
      // Push the floor down enough to show walls + some margin
      const offsetY = WALL_HEIGHT + 10;

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
        // Compute walk frame: 0=standing, 1-3=walk cycle
        const walkFrame = state.isWalking
          ? Math.floor(state.walkTime * WALK_CYCLE_SPEED) % 4
          : 0;
        drawShadow(ctx, sx, sy);
        drawSprite(ctx, state.spriteCanvas, state.sprite, sx, sy, walkFrame);
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafRef.current);
      lastTimeRef.current = 0;
      resizeObserver.disconnect();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
