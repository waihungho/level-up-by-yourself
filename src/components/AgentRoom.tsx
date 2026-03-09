"use client";

import { useRef, useEffect } from "react";
import { generateSpriteData } from "@/lib/sprite-renderer";
import type { Agent } from "@/lib/types";

// --- Constants ---
const TILE_W = 64;
const TILE_H = 32;
const GRID_SIZE = 8;
const CANVAS_HEIGHT = 200;
const SPRITE_SIZE = 32;

// Cyberpunk palette
const BG = "#030810";
const FLOOR_DARK = "#060d1a";
const FLOOR_LIGHT = "#081220";
const GRID_CYAN = "rgba(0,255,255,0.07)";
const GRID_CYAN_ACCENT = "rgba(0,255,255,0.18)";
const NEON_CYAN = [0, 255, 255] as const;
const NEON_PURPLE = [160, 80, 255] as const;
const NEON_BLUE = [40, 120, 255] as const;

// Walls
const WALL_HEIGHT = 32;
const WALL_FACE = "#040a18";
const WALL_SIDE = "#0a1428";

// Sprite
const SPRITE_SCALE = 3;
const SHADOW_COLOR = "rgba(0,200,255,0.12)";

// Movement
const MIN_SPEED = 0.15;
const MAX_SPEED = 0.3;
const SMOOTHING = 1.5;
const MIN_PAUSE = 2000;
const MAX_PAUSE = 6000;
const MAX_INITIAL_DELAY = 5000;
const WALK_CYCLE_SPEED = 3;
const MIN_AGENT_DIST = 1.2;

let globalPulse = 0;

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

function isoToScreen(gx: number, gy: number, ox: number, oy: number) {
  return {
    sx: (gx - gy) * (TILE_W / 2) + ox,
    sy: (gx + gy) * (TILE_H / 2) + oy,
  };
}

function pickRandomTile() {
  return {
    gx: Math.random() * (GRID_SIZE - 1) + 0.5,
    gy: Math.random() * (GRID_SIZE - 1) + 0.5,
  };
}

function pickNonOverlappingTile(others: WanderState[], maxAttempts = 20) {
  for (let i = 0; i < maxAttempts; i++) {
    const c = pickRandomTile();
    const tooClose = others.some((o) => {
      const d1 = Math.hypot(c.gx - o.gx, c.gy - o.gy);
      const d2 = Math.hypot(c.gx - o.targetGx, c.gy - o.targetGy);
      return d1 < MIN_AGENT_DIST || d2 < MIN_AGENT_DIST;
    });
    if (!tooClose) return c;
  }
  return pickRandomTile();
}

function randomSpeed() {
  return MIN_SPEED + Math.random() * (MAX_SPEED - MIN_SPEED);
}
function randomPause() {
  return MIN_PAUSE + Math.random() * (MAX_PAUSE - MIN_PAUSE);
}

// --- Drawing ---

function rgba(c: readonly [number, number, number], a: number) {
  return `rgba(${c[0]},${c[1]},${c[2]},${a})`;
}

/** 3D walls — back-left and back-right with tech panel look */
function drawWalls(ctx: CanvasRenderingContext2D, ox: number, oy: number) {
  const pulse = 0.5 + 0.5 * Math.sin(globalPulse * 0.6);

  // Back-right wall (left side visually)
  for (let gy = 0; gy < GRID_SIZE; gy++) {
    const { sx, sy } = isoToScreen(0, gy, ox, oy);
    const { sx: sx2, sy: sy2 } = isoToScreen(0, gy + 1, ox, oy);

    // Wall face
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx2, sy2);
    ctx.lineTo(sx2, sy2 - WALL_HEIGHT);
    ctx.lineTo(sx, sy - WALL_HEIGHT);
    ctx.closePath();
    ctx.fillStyle = WALL_FACE;
    ctx.fill();

    // Horizontal tech lines
    for (let h = 8; h < WALL_HEIGHT; h += 10) {
      const lineAlpha = 0.04 + 0.03 * Math.sin(globalPulse * 1.2 + gy * 0.6 + h * 0.1);
      ctx.strokeStyle = rgba(NEON_CYAN, lineAlpha);
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(sx, sy - h);
      ctx.lineTo(sx2, sy2 - h);
      ctx.stroke();
    }

    // Vertical circuit trace
    if (gy % 2 === 0) {
      const midX = (sx + sx2) / 2;
      const midY = (sy + sy2) / 2;
      ctx.strokeStyle = rgba(NEON_CYAN, 0.06 + 0.03 * pulse);
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(midX, midY - 6);
      ctx.lineTo(midX, midY - WALL_HEIGHT + 6);
      ctx.stroke();

      // Circuit node
      ctx.fillStyle = rgba(NEON_CYAN, 0.12 + 0.06 * pulse);
      ctx.beginPath();
      ctx.arc(midX, midY - WALL_HEIGHT / 2, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Back-left wall (right side visually)
  for (let gx = 0; gx < GRID_SIZE; gx++) {
    const { sx, sy } = isoToScreen(gx, 0, ox, oy);
    const { sx: sx2, sy: sy2 } = isoToScreen(gx + 1, 0, ox, oy);

    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx2, sy2);
    ctx.lineTo(sx2, sy2 - WALL_HEIGHT);
    ctx.lineTo(sx, sy - WALL_HEIGHT);
    ctx.closePath();
    ctx.fillStyle = WALL_SIDE;
    ctx.fill();

    // Horizontal tech lines
    for (let h = 8; h < WALL_HEIGHT; h += 10) {
      const lineAlpha = 0.04 + 0.03 * Math.sin(globalPulse * 1.2 + gx * 0.6 + h * 0.1);
      ctx.strokeStyle = rgba(NEON_PURPLE, lineAlpha);
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(sx, sy - h);
      ctx.lineTo(sx2, sy2 - h);
      ctx.stroke();
    }

    if (gx % 2 === 0) {
      const midX = (sx + sx2) / 2;
      const midY = (sy + sy2) / 2;
      ctx.strokeStyle = rgba(NEON_PURPLE, 0.06 + 0.03 * pulse);
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(midX, midY - 6);
      ctx.lineTo(midX, midY - WALL_HEIGHT + 6);
      ctx.stroke();

      ctx.fillStyle = rgba(NEON_PURPLE, 0.12 + 0.06 * pulse);
      ctx.beginPath();
      ctx.arc(midX, midY - WALL_HEIGHT / 2, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Wall top edge glow — cyan on right wall, purple on left wall
  const glowA = 0.35 + 0.2 * pulse;
  ctx.save();
  ctx.lineWidth = 1.5;
  ctx.shadowBlur = 8;

  // Right wall top edge (cyan)
  ctx.strokeStyle = rgba(NEON_CYAN, glowA);
  ctx.shadowColor = rgba(NEON_CYAN, 0.5);
  ctx.beginPath();
  for (let gy = 0; gy <= GRID_SIZE; gy++) {
    const { sx, sy } = isoToScreen(0, gy, ox, oy);
    if (gy === 0) ctx.moveTo(sx, sy - WALL_HEIGHT);
    else ctx.lineTo(sx, sy - WALL_HEIGHT);
  }
  ctx.stroke();

  // Left wall top edge (purple)
  ctx.strokeStyle = rgba(NEON_PURPLE, glowA);
  ctx.shadowColor = rgba(NEON_PURPLE, 0.5);
  ctx.beginPath();
  for (let gx = 0; gx <= GRID_SIZE; gx++) {
    const { sx, sy } = isoToScreen(gx, 0, ox, oy);
    if (gx === 0) ctx.moveTo(sx, sy - WALL_HEIGHT);
    else ctx.lineTo(sx, sy - WALL_HEIGHT);
  }
  ctx.stroke();

  // Corner node
  const corner = isoToScreen(0, 0, ox, oy);
  ctx.shadowBlur = 12;
  ctx.shadowColor = rgba(NEON_CYAN, 0.8);
  ctx.fillStyle = rgba(NEON_CYAN, glowA * 1.5);
  ctx.beginPath();
  ctx.arc(corner.sx, corner.sy - WALL_HEIGHT, 4, 0, Math.PI * 2);
  ctx.fill();

  // Corner vertical beam
  ctx.strokeStyle = rgba(NEON_CYAN, 0.15 + 0.1 * pulse);
  ctx.lineWidth = 1.5;
  ctx.shadowBlur = 6;
  ctx.beginPath();
  ctx.moveTo(corner.sx, corner.sy - WALL_HEIGHT - 16);
  ctx.lineTo(corner.sx, corner.sy);
  ctx.stroke();

  ctx.shadowBlur = 0;
  ctx.restore();
}

/** Holographic grid floor with circuit patterns */
function drawFloor(ctx: CanvasRenderingContext2D, ox: number, oy: number) {
  const pulse = 0.5 + 0.5 * Math.sin(globalPulse * 0.8);

  for (let gx = 0; gx < GRID_SIZE; gx++) {
    for (let gy = 0; gy < GRID_SIZE; gy++) {
      const isEven = (gx + gy) % 2 === 0;
      const { sx, sy } = isoToScreen(gx, gy, ox, oy);

      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + TILE_W / 2, sy + TILE_H / 2);
      ctx.lineTo(sx, sy + TILE_H);
      ctx.lineTo(sx - TILE_W / 2, sy + TILE_H / 2);
      ctx.closePath();

      ctx.fillStyle = isEven ? FLOOR_DARK : FLOOR_LIGHT;
      ctx.fill();

      const isAccent = gx % 4 === 0 || gy % 4 === 0;
      ctx.strokeStyle = isAccent ? GRID_CYAN_ACCENT : GRID_CYAN;
      ctx.lineWidth = isAccent ? 0.8 : 0.4;
      ctx.stroke();
    }
  }

  // Circuit traces on floor — diagonal traces connecting tiles
  ctx.save();
  ctx.lineWidth = 0.6;
  for (let i = 0; i < GRID_SIZE; i += 2) {
    const traceAlpha = 0.05 + 0.03 * Math.sin(globalPulse * 0.5 + i);
    ctx.strokeStyle = rgba(NEON_BLUE, traceAlpha);
    const p1 = isoToScreen(i, 0, ox, oy);
    const p2 = isoToScreen(i, GRID_SIZE, ox, oy);
    ctx.beginPath();
    ctx.moveTo(p1.sx, p1.sy + TILE_H / 2);
    ctx.lineTo(p2.sx, p2.sy + TILE_H / 2);
    ctx.stroke();
  }
  for (let i = 0; i < GRID_SIZE; i += 2) {
    const traceAlpha = 0.05 + 0.03 * Math.sin(globalPulse * 0.5 + i + 3);
    ctx.strokeStyle = rgba(NEON_CYAN, traceAlpha);
    const p1 = isoToScreen(0, i, ox, oy);
    const p2 = isoToScreen(GRID_SIZE, i, ox, oy);
    ctx.beginPath();
    ctx.moveTo(p1.sx, p1.sy + TILE_H / 2);
    ctx.lineTo(p2.sx, p2.sy + TILE_H / 2);
    ctx.stroke();
  }
  ctx.restore();

  // Center holographic ring
  drawCenterHolo(ctx, ox, oy, pulse);
}

/** Holographic center ring — concentric ellipses with scanning effect */
function drawCenterHolo(ctx: CanvasRenderingContext2D, ox: number, oy: number, pulse: number) {
  const center = isoToScreen(GRID_SIZE / 2, GRID_SIZE / 2, ox, oy);
  const cx = center.sx;
  const cy = center.sy + TILE_H / 2;

  ctx.save();

  // Outer ring
  ctx.strokeStyle = rgba(NEON_CYAN, 0.12 + 0.08 * pulse);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(cx, cy, TILE_W * 2, TILE_H * 2, 0, 0, Math.PI * 2);
  ctx.stroke();

  // Middle ring
  ctx.strokeStyle = rgba(NEON_PURPLE, 0.10 + 0.05 * pulse);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(cx, cy, TILE_W * 1.2, TILE_H * 1.2, 0, 0, Math.PI * 2);
  ctx.stroke();

  // Inner ring
  ctx.strokeStyle = rgba(NEON_CYAN, 0.08 + 0.04 * pulse);
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.ellipse(cx, cy, TILE_W * 0.5, TILE_H * 0.5, 0, 0, Math.PI * 2);
  ctx.stroke();

  // Rotating scan line (one arc segment that sweeps)
  const sweepAngle = globalPulse * 0.4;
  ctx.strokeStyle = rgba(NEON_CYAN, 0.25 + 0.15 * pulse);
  ctx.lineWidth = 2;
  ctx.shadowColor = rgba(NEON_CYAN, 0.6);
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.ellipse(cx, cy, TILE_W * 1.6, TILE_H * 1.6, 0, sweepAngle, sweepAngle + 0.8);
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Center data point
  ctx.fillStyle = rgba(NEON_CYAN, 0.3 + 0.2 * pulse);
  ctx.beginPath();
  ctx.arc(cx, cy, 3, 0, Math.PI * 2);
  ctx.fill();

  // Crosshair lines
  ctx.strokeStyle = rgba(NEON_CYAN, 0.06 + 0.03 * pulse);
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.moveTo(cx - TILE_W * 2.5, cy);
  ctx.lineTo(cx + TILE_W * 2.5, cy);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx, cy - TILE_H * 2.5);
  ctx.lineTo(cx, cy + TILE_H * 2.5);
  ctx.stroke();

  ctx.restore();
}

/** Floor edge glow on open sides */
function drawEdgeGlow(ctx: CanvasRenderingContext2D, ox: number, oy: number) {
  const pulse = 0.5 + 0.5 * Math.sin(globalPulse * 0.8);
  const alpha = 0.18 + 0.1 * pulse;

  ctx.save();
  ctx.lineWidth = 1.5;

  // Bottom-left edge (cyan)
  const bl = isoToScreen(0, GRID_SIZE, ox, oy);
  const bot = isoToScreen(GRID_SIZE, GRID_SIZE, ox, oy);
  ctx.strokeStyle = rgba(NEON_CYAN, alpha);
  ctx.shadowColor = rgba(NEON_CYAN, 0.4);
  ctx.shadowBlur = 6;
  ctx.beginPath();
  ctx.moveTo(bl.sx, bl.sy + TILE_H / 2);
  ctx.lineTo(bot.sx, bot.sy + TILE_H / 2);
  ctx.stroke();

  // Bottom-right edge (purple)
  const br = isoToScreen(GRID_SIZE, 0, ox, oy);
  ctx.strokeStyle = rgba(NEON_PURPLE, alpha);
  ctx.shadowColor = rgba(NEON_PURPLE, 0.4);
  ctx.beginPath();
  ctx.moveTo(br.sx, br.sy + TILE_H / 2);
  ctx.lineTo(bot.sx, bot.sy + TILE_H / 2);
  ctx.stroke();

  ctx.shadowBlur = 0;
  ctx.restore();
}

/** HUD overlay — corner brackets and data text */
function drawHUD(ctx: CanvasRenderingContext2D, w: number, h: number, agentCount: number) {
  const pulse = 0.5 + 0.5 * Math.sin(globalPulse * 1.0);
  const alpha = 0.15 + 0.08 * pulse;
  const bracketLen = 20;

  ctx.save();
  ctx.strokeStyle = rgba(NEON_CYAN, alpha);
  ctx.lineWidth = 1;

  // Top-left bracket
  ctx.beginPath();
  ctx.moveTo(8, 8 + bracketLen);
  ctx.lineTo(8, 8);
  ctx.lineTo(8 + bracketLen, 8);
  ctx.stroke();

  // Top-right bracket
  ctx.beginPath();
  ctx.moveTo(w - 8 - bracketLen, 8);
  ctx.lineTo(w - 8, 8);
  ctx.lineTo(w - 8, 8 + bracketLen);
  ctx.stroke();

  // Bottom-left bracket
  ctx.beginPath();
  ctx.moveTo(8, h - 8 - bracketLen);
  ctx.lineTo(8, h - 8);
  ctx.lineTo(8 + bracketLen, h - 8);
  ctx.stroke();

  // Bottom-right bracket
  ctx.beginPath();
  ctx.moveTo(w - 8 - bracketLen, h - 8);
  ctx.lineTo(w - 8, h - 8);
  ctx.lineTo(w - 8, h - 8 - bracketLen);
  ctx.stroke();

  // Data readout text
  ctx.font = "8px monospace";
  ctx.fillStyle = rgba(NEON_CYAN, 0.2 + 0.1 * pulse);
  ctx.fillText(`AGENTS: ${agentCount}`, 14, 22);
  ctx.fillText(`SYS: ONLINE`, 14, 32);

  // Top-right status
  ctx.textAlign = "right";
  ctx.fillStyle = rgba(NEON_PURPLE, 0.18 + 0.08 * pulse);
  const t = Math.floor(globalPulse * 10) % 10000;
  ctx.fillText(`T:${String(t).padStart(4, "0")}`, w - 14, 22);
  ctx.fillText(`SCAN: ACTIVE`, w - 14, 32);
  ctx.textAlign = "left";

  ctx.restore();
}

// Data rain particles
interface DataParticle {
  x: number;
  y: number;
  speed: number;
  char: string;
  phase: number;
  color: readonly [number, number, number];
}

const DATA_PARTICLES: DataParticle[] = [];
const CHARS = "01アイウエオカキクケコ>>=::";
for (let i = 0; i < 30; i++) {
  DATA_PARTICLES.push({
    x: Math.random(),
    y: Math.random(),
    speed: 0.3 + Math.random() * 0.8,
    char: CHARS[Math.floor(Math.random() * CHARS.length)],
    phase: Math.random() * Math.PI * 2,
    color: Math.random() > 0.6 ? NEON_PURPLE : NEON_CYAN,
  });
}

function drawDataRain(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.save();
  ctx.font = "7px monospace";
  for (const p of DATA_PARTICLES) {
    const px = p.x * w;
    const rawY = p.y + (globalPulse * p.speed * 0.03) % 1;
    const py = (rawY % 1) * h;
    const alpha = 0.12 + 0.08 * Math.sin(globalPulse * 0.6 + p.phase);
    ctx.fillStyle = rgba(p.color, alpha);
    ctx.fillText(p.char, px, py);
  }
  ctx.restore();
}

// Floating hex particles (holographic dust)
interface HexParticle {
  x: number;
  y: number;
  speed: number;
  phase: number;
  size: number;
}
const HEX_PARTICLES: HexParticle[] = [];
for (let i = 0; i < 15; i++) {
  HEX_PARTICLES.push({
    x: Math.random(),
    y: Math.random(),
    speed: 0.1 + Math.random() * 0.3,
    phase: Math.random() * Math.PI * 2,
    size: 1 + Math.random() * 2,
  });
}

function drawHoloParticles(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.save();
  for (const p of HEX_PARTICLES) {
    const px = p.x * w + Math.sin(globalPulse * 0.2 + p.phase) * 15;
    const rawY = p.y - (globalPulse * p.speed * 0.015) % 1;
    const py = ((rawY % 1) + 1) % 1 * h;
    const alpha = 0.15 + 0.1 * Math.sin(globalPulse * 0.5 + p.phase);
    const c = p.phase > Math.PI ? NEON_CYAN : NEON_PURPLE;

    ctx.fillStyle = rgba(c, alpha);
    ctx.beginPath();
    ctx.arc(px, py, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawScanlines(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.03)";
  for (let y = 0; y < h; y += 2) {
    ctx.fillRect(0, y, w, 1);
  }
  ctx.restore();
}

function drawVignette(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.save();
  const grad = ctx.createRadialGradient(
    w / 2, h / 2, Math.min(w, h) * 0.25,
    w / 2, h / 2, Math.max(w, h) * 0.7,
  );
  grad.addColorStop(0, "rgba(0,0,0,0)");
  grad.addColorStop(1, "rgba(0,0,0,0.45)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

function drawShadow(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.save();
  ctx.fillStyle = SHADOW_COLOR;
  ctx.beginPath();
  ctx.ellipse(x, y + 4, 18, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawAgentGlow(ctx: CanvasRenderingContext2D, x: number, y: number, walking: boolean) {
  const pulse = 0.5 + 0.5 * Math.sin(globalPulse * 1.2);
  const alpha = walking ? 0.12 + 0.06 * pulse : 0.06 + 0.04 * pulse;
  const r = walking ? 26 : 22;

  ctx.save();
  const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
  grad.addColorStop(0, rgba(NEON_CYAN, alpha * 2));
  grad.addColorStop(0.5, rgba(NEON_BLUE, alpha));
  grad.addColorStop(1, "rgba(0,100,255,0)");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.ellipse(x, y + 2, r, r * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();
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
        let yOff = 0;
        if (y >= legTop && y <= legBottom) {
          const isLeft = x < spriteCx;
          if (walkFrame === 1) yOff = isLeft ? -1 : 1;
          else if (walkFrame === 3) yOff = isLeft ? 1 : -1;
        }
        if (y < legTop && (walkFrame === 1 || walkFrame === 3)) yOff = -1;

        ctx.fillStyle = color;
        ctx.fillRect(
          ox + x * SPRITE_SCALE,
          oy + (y + yOff) * SPRITE_SCALE,
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
    const ids = new Set(agents.map((a) => a.id));
    for (const id of map.keys()) {
      if (!ids.has(id)) map.delete(id);
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
    let cw = parent?.clientWidth ?? 480;

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        cw = entry.contentRect.width;
        canvas.width = cw;
        canvas.height = CANVAS_HEIGHT;
        ctx.imageSmoothingEnabled = false;
      }
    });

    if (parent) {
      ro.observe(parent);
      cw = parent.clientWidth;
    }
    canvas.width = cw;
    canvas.height = CANVAS_HEIGHT;
    ctx.imageSmoothingEnabled = false;

    const tick = (ts: number) => {
      if (!lastTimeRef.current) lastTimeRef.current = ts;
      const dt = Math.min((ts - lastTimeRef.current) / 1000, 0.1);
      lastTimeRef.current = ts;
      globalPulse += dt;

      const map = wanderRef.current;
      for (const state of map.values()) {
        if (ts < state.pauseUntil) {
          state.isWalking = false;
          state.walkTime = 0;
          continue;
        }
        const dx = state.targetGx - state.gx;
        const dy = state.targetGy - state.gy;
        const dist = Math.hypot(dx, dy);
        if (dist < 0.05) {
          state.gx = state.targetGx;
          state.gy = state.targetGy;
          state.pauseUntil = ts + randomPause();
          const others = [...map.values()].filter((s) => s !== state);
          const next = pickNonOverlappingTile(others);
          state.targetGx = next.gx;
          state.targetGy = next.gy;
          state.speed = randomSpeed();
          state.isWalking = false;
          state.walkTime = 0;
        } else {
          const f = 1 - Math.exp(-SMOOTHING * state.speed * dt);
          state.gx += dx * f;
          state.gy += dy * f;
          state.isWalking = true;
          state.walkTime += dt;
        }
      }

      // Clear with bg
      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, cw, CANVAS_HEIGHT);

      // Scale down the grid to fit narrow screens
      const gridPixelWidth = GRID_SIZE * TILE_W + TILE_W; // total iso width with margins
      const scale = Math.min(1, cw / gridPixelWidth);

      ctx.save();
      if (scale < 1) {
        ctx.translate(cw / 2, 0);
        ctx.scale(scale, scale);
        ctx.translate(-cw / 2 / scale, 0);
      }

      const scaledCw = scale < 1 ? cw / scale : cw;
      const offsetX = scaledCw / 2;
      const offsetY = WALL_HEIGHT + 16;

      // Walls behind everything
      drawWalls(ctx, offsetX, offsetY);

      // Floor
      drawFloor(ctx, offsetX, offsetY);

      // Edge glow
      drawEdgeGlow(ctx, offsetX, offsetY);

      // Data rain behind agents
      drawDataRain(ctx, scaledCw, CANVAS_HEIGHT);

      // Depth-sort agents
      const sorted: { state: WanderState; depth: number }[] = [];
      for (const state of map.values()) {
        sorted.push({ state, depth: state.gx + state.gy });
      }
      sorted.sort((a, b) => a.depth - b.depth);

      for (const { state } of sorted) {
        const { sx, sy } = isoToScreen(state.gx, state.gy, offsetX, offsetY);
        const wf = state.isWalking
          ? Math.floor(state.walkTime * WALK_CYCLE_SPEED) % 4
          : 0;
        drawAgentGlow(ctx, sx, sy, state.isWalking);
        drawShadow(ctx, sx, sy);
        drawSprite(ctx, state.spriteCanvas, state.sprite, sx, sy, wf);
      }

      // Holo particles on top
      drawHoloParticles(ctx, scaledCw, CANVAS_HEIGHT);

      // Overlays
      drawScanlines(ctx, scaledCw, CANVAS_HEIGHT);
      drawVignette(ctx, scaledCw, CANVAS_HEIGHT);
      drawHUD(ctx, scaledCw, CANVAS_HEIGHT, map.size);

      ctx.restore();

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafRef.current);
      lastTimeRef.current = 0;
      ro.disconnect();
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
