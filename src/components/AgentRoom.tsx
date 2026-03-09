"use client";

import { useRef, useEffect } from "react";
import { generateSpriteData } from "@/lib/sprite-renderer";
import type { Agent } from "@/lib/types";

// --- Constants ---
const TILE_W = 64;
const TILE_H = 32;
const GRID_SIZE = 8;
const CANVAS_HEIGHT = 320;
const SPRITE_SIZE = 32;

// Arena floor
const TILE_DARK = "#0a0a18";
const TILE_LIGHT = "#0e0e22";
const GRID_LINE = "rgba(60,100,200,0.06)";
const GRID_LINE_ACCENT = "rgba(100,180,255,0.14)";

// Arena barrier
const BARRIER_HEIGHT = 28;
const BARRIER_FACE = "#0c0c24";
const BARRIER_TOP = "#181840";

// Shadow
const SHADOW_COLOR = "rgba(0,0,0,0.45)";

// Sprite scale
const SPRITE_SCALE = 2;

// Movement
const MIN_SPEED = 0.15;
const MAX_SPEED = 0.3;
const SMOOTHING = 1.5;
const MIN_PAUSE = 2000;
const MAX_PAUSE = 6000;
const MAX_INITIAL_DELAY = 5000;

// Walk animation
const WALK_CYCLE_SPEED = 3;

// --- Pulse state ---
let globalPulse = 0;

// --- Internal wandering state per agent ---
interface WanderState {
  gx: number;
  gy: number;
  targetGx: number;
  targetGy: number;
  speed: number;
  pauseUntil: number;
  sprite: (string | null)[][];
  spriteCanvas: OffscreenCanvas;
  walkTime: number;
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

const MIN_AGENT_DIST = 1.2;

function pickRandomTile(): { gx: number; gy: number } {
  return {
    gx: Math.random() * (GRID_SIZE - 1) + 0.5,
    gy: Math.random() * (GRID_SIZE - 1) + 0.5,
  };
}

function pickNonOverlappingTile(
  others: WanderState[],
  maxAttempts = 20,
): { gx: number; gy: number } {
  for (let i = 0; i < maxAttempts; i++) {
    const candidate = pickRandomTile();
    const tooClose = others.some((o) => {
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
  return pickRandomTile();
}

function randomSpeed(): number {
  return MIN_SPEED + Math.random() * (MAX_SPEED - MIN_SPEED);
}

function randomPause(): number {
  return MIN_PAUSE + Math.random() * (MAX_PAUSE - MIN_PAUSE);
}

// --- Drawing helpers ---

/** Center ring marking on the arena floor (isometric ellipse) */
function drawArenaCenterRing(
  ctx: CanvasRenderingContext2D,
  offsetX: number,
  offsetY: number,
) {
  const pulse = 0.5 + 0.5 * Math.sin(globalPulse * 0.8);
  const center = isoToScreen(GRID_SIZE / 2, GRID_SIZE / 2, offsetX, offsetY);
  const cx = center.sx;
  const cy = center.sy + TILE_H / 2;

  // Outer ring
  ctx.save();
  ctx.strokeStyle = `rgba(255,60,60,${0.12 + 0.06 * pulse})`;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(cx, cy, TILE_W * 1.8, TILE_H * 1.8, 0, 0, Math.PI * 2);
  ctx.stroke();

  // Inner ring
  ctx.strokeStyle = `rgba(255,100,40,${0.08 + 0.04 * pulse})`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(cx, cy, TILE_W * 1.0, TILE_H * 1.0, 0, 0, Math.PI * 2);
  ctx.stroke();

  // Center dot
  ctx.fillStyle = `rgba(255,80,40,${0.15 + 0.1 * pulse})`;
  ctx.beginPath();
  ctx.arc(cx, cy, 3, 0, Math.PI * 2);
  ctx.fill();

  // Cross lines through center
  const crossLen = TILE_W * 2.2;
  const crossH = TILE_H * 2.2;
  ctx.strokeStyle = `rgba(255,60,60,${0.06 + 0.03 * pulse})`;
  ctx.lineWidth = 0.8;

  // Iso-aligned cross: top-left to bottom-right
  ctx.beginPath();
  ctx.moveTo(cx - crossLen / 2, cy);
  ctx.lineTo(cx + crossLen / 2, cy);
  ctx.stroke();

  // Iso-aligned cross: top-right to bottom-left
  ctx.beginPath();
  ctx.moveTo(cx, cy - crossH / 2);
  ctx.lineTo(cx, cy + crossH / 2);
  ctx.stroke();

  ctx.restore();
}

/** Arena floor markings — corner markers and danger zones */
function drawArenaMarkings(
  ctx: CanvasRenderingContext2D,
  offsetX: number,
  offsetY: number,
) {
  const pulse = 0.5 + 0.5 * Math.sin(globalPulse * 1.0);

  // Corner energy nodes at each corner of the arena
  const corners = [
    isoToScreen(0, 0, offsetX, offsetY),           // top
    isoToScreen(GRID_SIZE, 0, offsetX, offsetY),    // right
    isoToScreen(0, GRID_SIZE, offsetX, offsetY),    // left
    isoToScreen(GRID_SIZE, GRID_SIZE, offsetX, offsetY), // bottom
  ];

  ctx.save();
  for (let i = 0; i < corners.length; i++) {
    const c = corners[i];
    const cy = c.sy + TILE_H / 2;

    // Glow
    const grad = ctx.createRadialGradient(c.sx, cy, 0, c.sx, cy, 20);
    const alpha = 0.08 + 0.05 * pulse;
    grad.addColorStop(0, `rgba(255,80,40,${alpha})`);
    grad.addColorStop(1, "rgba(255,80,40,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(c.sx, cy, 20, 0, Math.PI * 2);
    ctx.fill();

    // Dot
    ctx.fillStyle = `rgba(255,100,50,${0.3 + 0.2 * pulse})`;
    ctx.beginPath();
    ctx.arc(c.sx, cy, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawFloor(
  ctx: CanvasRenderingContext2D,
  offsetX: number,
  offsetY: number,
) {
  for (let gx = 0; gx < GRID_SIZE; gx++) {
    for (let gy = 0; gy < GRID_SIZE; gy++) {
      const isEven = (gx + gy) % 2 === 0;
      const { sx, sy } = isoToScreen(gx, gy, offsetX, offsetY);

      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + TILE_W / 2, sy + TILE_H / 2);
      ctx.lineTo(sx, sy + TILE_H);
      ctx.lineTo(sx - TILE_W / 2, sy + TILE_H / 2);
      ctx.closePath();

      ctx.fillStyle = isEven ? TILE_DARK : TILE_LIGHT;
      ctx.fill();

      const isAccent = gx % 4 === 0 || gy % 4 === 0;
      ctx.strokeStyle = isAccent ? GRID_LINE_ACCENT : GRID_LINE;
      ctx.lineWidth = isAccent ? 1 : 0.6;
      ctx.stroke();
    }
  }

  // Arena markings on top of floor
  drawArenaCenterRing(ctx, offsetX, offsetY);
  drawArenaMarkings(ctx, offsetX, offsetY);
}

/** Arena barriers — low walls with energy field effect */
function drawBarriers(
  ctx: CanvasRenderingContext2D,
  offsetX: number,
  offsetY: number,
) {
  const pulse = 0.5 + 0.5 * Math.sin(globalPulse * 0.6);

  // Top-right barrier
  for (let gy = 0; gy < GRID_SIZE; gy++) {
    const { sx, sy } = isoToScreen(0, gy, offsetX, offsetY);

    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx - TILE_W / 2, sy + TILE_H / 2);
    ctx.lineTo(sx - TILE_W / 2, sy + TILE_H / 2 - BARRIER_HEIGHT);
    ctx.lineTo(sx, sy - BARRIER_HEIGHT);
    ctx.closePath();
    ctx.fillStyle = BARRIER_FACE;
    ctx.fill();

    // Energy field lines
    const fieldAlpha = 0.06 + 0.04 * Math.sin(globalPulse * 1.5 + gy * 0.8);
    ctx.strokeStyle = `rgba(255,60,40,${fieldAlpha})`;
    ctx.lineWidth = 0.8;
    for (let h = 6; h < BARRIER_HEIGHT; h += 8) {
      ctx.beginPath();
      ctx.moveTo(sx, sy - h);
      ctx.lineTo(sx - TILE_W / 2, sy + TILE_H / 2 - h);
      ctx.stroke();
    }
  }

  // Top-left barrier
  for (let gx = 0; gx < GRID_SIZE; gx++) {
    const { sx, sy } = isoToScreen(gx, 0, offsetX, offsetY);

    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + TILE_W / 2, sy + TILE_H / 2);
    ctx.lineTo(sx + TILE_W / 2, sy + TILE_H / 2 - BARRIER_HEIGHT);
    ctx.lineTo(sx, sy - BARRIER_HEIGHT);
    ctx.closePath();
    ctx.fillStyle = BARRIER_FACE;
    ctx.fill();

    // Energy field lines
    const fieldAlpha = 0.06 + 0.04 * Math.sin(globalPulse * 1.5 + gx * 0.8);
    ctx.strokeStyle = `rgba(255,60,40,${fieldAlpha})`;
    ctx.lineWidth = 0.8;
    for (let h = 6; h < BARRIER_HEIGHT; h += 8) {
      ctx.beginPath();
      ctx.moveTo(sx, sy - h);
      ctx.lineTo(sx + TILE_W / 2, sy + TILE_H / 2 - h);
      ctx.stroke();
    }
  }

  // Barrier top glow (continuous energy line)
  ctx.save();
  const glowAlpha = 0.25 + 0.15 * pulse;

  // Left barrier top
  ctx.lineWidth = 2;
  ctx.strokeStyle = `rgba(255,70,30,${glowAlpha})`;
  ctx.shadowColor = "rgba(255,70,30,0.4)";
  ctx.shadowBlur = 6;
  ctx.beginPath();
  const ltStart = isoToScreen(0, 0, offsetX, offsetY);
  ctx.moveTo(ltStart.sx, ltStart.sy - BARRIER_HEIGHT);
  for (let gx = 1; gx <= GRID_SIZE; gx++) {
    const { sx, sy } = isoToScreen(gx, 0, offsetX, offsetY);
    ctx.lineTo(sx, sy - BARRIER_HEIGHT);
  }
  ctx.stroke();

  // Right barrier top
  ctx.beginPath();
  ctx.moveTo(ltStart.sx, ltStart.sy - BARRIER_HEIGHT);
  for (let gy = 1; gy <= GRID_SIZE; gy++) {
    const { sx, sy } = isoToScreen(0, gy, offsetX, offsetY);
    ctx.lineTo(sx, sy - BARRIER_HEIGHT);
  }
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Corner energy pillar
  ctx.fillStyle = `rgba(255,100,40,${glowAlpha * 1.2})`;
  ctx.beginPath();
  ctx.arc(ltStart.sx, ltStart.sy - BARRIER_HEIGHT, 4, 0, Math.PI * 2);
  ctx.fill();

  // Corner vertical beam
  ctx.strokeStyle = `rgba(255,80,30,${0.1 + 0.06 * pulse})`;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(ltStart.sx, ltStart.sy - BARRIER_HEIGHT - 12);
  ctx.lineTo(ltStart.sx, ltStart.sy - BARRIER_HEIGHT + 4);
  ctx.stroke();

  // Right-end and left-end pillar nodes
  const rightEnd = isoToScreen(GRID_SIZE, 0, offsetX, offsetY);
  const leftEnd = isoToScreen(0, GRID_SIZE, offsetX, offsetY);
  for (const p of [rightEnd, leftEnd]) {
    ctx.fillStyle = `rgba(255,100,40,${glowAlpha * 0.8})`;
    ctx.beginPath();
    ctx.arc(p.sx, p.sy - BARRIER_HEIGHT, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

/** Edge glow on the open sides of the arena (bottom-left and bottom-right) */
function drawEdgeGlow(
  ctx: CanvasRenderingContext2D,
  offsetX: number,
  offsetY: number,
) {
  const pulse = 0.5 + 0.5 * Math.sin(globalPulse * 0.8);
  const alpha = 0.12 + 0.08 * pulse;

  ctx.save();
  ctx.lineWidth = 2;
  ctx.strokeStyle = `rgba(255,70,30,${alpha})`;
  ctx.shadowColor = "rgba(255,70,30,0.3)";
  ctx.shadowBlur = 4;

  // Bottom-left edge
  const bl = isoToScreen(0, GRID_SIZE, offsetX, offsetY);
  const bot = isoToScreen(GRID_SIZE, GRID_SIZE, offsetX, offsetY);
  ctx.beginPath();
  ctx.moveTo(bl.sx, bl.sy + TILE_H / 2);
  ctx.lineTo(bot.sx, bot.sy + TILE_H / 2);
  ctx.stroke();

  // Bottom-right edge
  const br = isoToScreen(GRID_SIZE, 0, offsetX, offsetY);
  ctx.beginPath();
  ctx.moveTo(br.sx, br.sy + TILE_H / 2);
  ctx.lineTo(bot.sx, bot.sy + TILE_H / 2);
  ctx.stroke();

  ctx.shadowBlur = 0;
  ctx.restore();
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

function drawAgentGlow(
  ctx: CanvasRenderingContext2D,
  screenX: number,
  screenY: number,
  isWalking: boolean,
) {
  const pulse = 0.5 + 0.5 * Math.sin(globalPulse * 1.2);
  const alpha = isWalking ? 0.08 + 0.04 * pulse : 0.05 + 0.03 * pulse;
  const radius = isWalking ? 24 : 20;

  ctx.save();
  const grad = ctx.createRadialGradient(screenX, screenY, 0, screenX, screenY, radius);
  grad.addColorStop(0, `rgba(100,180,255,${alpha * 2})`);
  grad.addColorStop(0.6, `rgba(80,120,255,${alpha})`);
  grad.addColorStop(1, "rgba(80,120,255,0)");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.ellipse(screenX, screenY + 2, radius, radius * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// Ambient rising particles (embers/sparks)
const PARTICLES: { x: number; y: number; speed: number; phase: number; size: number }[] = [];
for (let i = 0; i < 20; i++) {
  PARTICLES.push({
    x: Math.random(),
    y: Math.random(),
    speed: 0.2 + Math.random() * 0.6,
    phase: Math.random() * Math.PI * 2,
    size: 0.5 + Math.random() * 1,
  });
}

function drawParticles(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
) {
  ctx.save();
  for (const p of PARTICLES) {
    const px = p.x * width + Math.sin(globalPulse * 0.3 + p.phase) * 10;
    // Rise upward over time
    const rawY = p.y - (globalPulse * p.speed * 0.02) % 1;
    const py = ((rawY % 1) + 1) % 1 * height;
    const alpha = 0.2 + 0.15 * Math.sin(globalPulse * 0.8 + p.phase);

    // Mix of orange and blue particles
    const isOrange = p.phase > Math.PI;
    const color = isOrange
      ? `rgba(255,120,40,${alpha})`
      : `rgba(100,180,255,${alpha * 0.7})`;

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(px, py, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawScanlines(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
) {
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.025)";
  for (let y = 0; y < height; y += 3) {
    ctx.fillRect(0, y, width, 1);
  }
  ctx.restore();
}

/** Vignette darkening at the edges */
function drawVignette(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
) {
  ctx.save();
  const grad = ctx.createRadialGradient(
    width / 2, height / 2, Math.min(width, height) * 0.3,
    width / 2, height / 2, Math.max(width, height) * 0.7,
  );
  grad.addColorStop(0, "rgba(0,0,0,0)");
  grad.addColorStop(1, "rgba(0,0,0,0.3)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

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
  walkFrame: number,
) {
  const rendered = SPRITE_SIZE * SPRITE_SCALE;
  const ox = Math.round(screenX - rendered / 2);
  const oy = Math.round(screenY - rendered);

  if (walkFrame === 0) {
    ctx.drawImage(spriteCanvas, ox, oy, rendered, rendered);
    return;
  }

  const legTop = 22;
  const legBottom = 28;
  const spriteCx = 15;

  for (let y = 0; y < SPRITE_SIZE; y++) {
    for (let x = 0; x < SPRITE_SIZE; x++) {
      const color = sprite[y][x];
      if (color) {
        let yOffset = 0;
        if (y >= legTop && y <= legBottom) {
          const isLeftLeg = x < spriteCx;
          if (walkFrame === 1) yOffset = isLeftLeg ? -1 : 1;
          else if (walkFrame === 3) yOffset = isLeftLeg ? 1 : -1;
        }
        if (y < legTop && (walkFrame === 1 || walkFrame === 3)) yOffset = -1;

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

  const agentsRef = useRef<Agent[]>(agents);
  agentsRef.current = agents;

  useEffect(() => {
    const map = wanderRef.current;
    const agentIds = new Set(agents.map((a) => a.id));

    for (const id of map.keys()) {
      if (!agentIds.has(id)) map.delete(id);
    }

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

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

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
      const dt = Math.min((timestamp - lastTimeRef.current) / 1000, 0.1);
      lastTimeRef.current = timestamp;
      globalPulse += dt;

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
          const lerpFactor = 1 - Math.exp(-SMOOTHING * state.speed * dt);
          state.gx += dx * lerpFactor;
          state.gy += dy * lerpFactor;
          state.isWalking = true;
          state.walkTime += dt;
        }
      }

      ctx.clearRect(0, 0, canvasWidth, CANVAS_HEIGHT);

      const offsetX = canvasWidth / 2;
      const offsetY = BARRIER_HEIGHT + 14;

      // Barriers (behind floor)
      drawBarriers(ctx, offsetX, offsetY);

      // Floor
      drawFloor(ctx, offsetX, offsetY);

      // Edge glow on open sides
      drawEdgeGlow(ctx, offsetX, offsetY);

      // Particles
      drawParticles(ctx, canvasWidth, CANVAS_HEIGHT);

      // Depth-sort agents
      const sorted: { state: WanderState; depth: number }[] = [];
      for (const state of map.values()) {
        sorted.push({ state, depth: state.gx + state.gy });
      }
      sorted.sort((a, b) => a.depth - b.depth);

      for (const { state } of sorted) {
        const { sx, sy } = isoToScreen(state.gx, state.gy, offsetX, offsetY);
        const walkFrame = state.isWalking
          ? Math.floor(state.walkTime * WALK_CYCLE_SPEED) % 4
          : 0;
        drawAgentGlow(ctx, sx, sy, state.isWalking);
        drawShadow(ctx, sx, sy);
        drawSprite(ctx, state.spriteCanvas, state.sprite, sx, sy, walkFrame);
      }

      // Overlays
      drawScanlines(ctx, canvasWidth, CANVAS_HEIGHT);
      drawVignette(ctx, canvasWidth, CANVAS_HEIGHT);

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
