"use client";

import { useRef, useEffect } from "react";
import { generateSpriteData } from "@/lib/sprite-renderer";
import type { Agent } from "@/lib/types";
import * as PIXI from "pixi.js";
import { BloomFilter } from "@pixi/filter-bloom";
import { GlowFilter } from "@pixi/filter-glow";

// --- Constants ---
const TILE_W = 96;
const TILE_H = 48;
const GRID_SIZE = 8;
const CANVAS_ASPECT = 0.72; // height = width * aspect
const SPRITE_SIZE = 32;
const SPRITE_SCALE = 6;
const WALL_HEIGHT = 96;

// Movement
const MIN_SPEED = 0.15;
const MAX_SPEED = 0.3;
const SMOOTHING = 1.5;
const MIN_PAUSE = 2000;
const MAX_PAUSE = 6000;
const MAX_INITIAL_DELAY = 5000;
const WALK_CYCLE_SPEED = 3;
const MIN_AGENT_DIST = 1.2;

// Palette
const NEON_CYAN = 0x00ffff;
const NEON_PURPLE = 0xa050ff;
const NEON_BLUE = 0x2878ff;
const BG_COLOR = 0x030810;
const FLOOR_DARK = 0x060d1a;
const FLOOR_LIGHT = 0x081220;
const WALL_FACE = 0x040a18;
const WALL_SIDE = 0x060e20;

// Role colors
const ROLE_COLORS: Record<string, number> = {
  mage: 0xa855f7,
  scout: 0x06b6d4,
  ranger: 0x06b6d4,
  warrior: 0xf59e0b,
  healer: 0x34d399,
  default: 0x00ffff,
};

function roleColor(role: string): number {
  return ROLE_COLORS[role.toLowerCase()] ?? ROLE_COLORS.default;
}

// --- Types ---
interface WanderState {
  gx: number;
  gy: number;
  targetGx: number;
  targetGy: number;
  speed: number;
  pauseUntil: number;
  sprite: (string | null)[][];
  walkTime: number;
  isWalking: boolean;
  role: string;
  shadowGfx: PIXI.Graphics;
  haloSprite: PIXI.Sprite;
  agentSprite: PIXI.Sprite;
  agentTexture: PIXI.RenderTexture;
}

interface Particle {
  sprite: PIXI.Sprite;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
}

// --- Iso math ---
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

function randomSpeed() { return MIN_SPEED + Math.random() * (MAX_SPEED - MIN_SPEED); }
function randomPause() { return MIN_PAUSE + Math.random() * (MAX_PAUSE - MIN_PAUSE); }

// --- Texture helpers ---

function buildAgentTexture(app: PIXI.Application, sprite: (string | null)[][]): PIXI.RenderTexture {
  const gfx = new PIXI.Graphics();
  for (let y = 0; y < SPRITE_SIZE; y++) {
    for (let x = 0; x < SPRITE_SIZE; x++) {
      const color = sprite[y][x];
      if (color) {
        gfx.beginFill(parseInt(color.replace("#", ""), 16));
        gfx.drawRect(x, y, 1, 1);
        gfx.endFill();
      }
    }
  }
  const rt = PIXI.RenderTexture.create({ width: SPRITE_SIZE, height: SPRITE_SIZE });
  app.renderer.render(gfx, { renderTexture: rt });
  gfx.destroy();
  return rt;
}

function buildHaloTexture(app: PIXI.Application, size = 80): PIXI.RenderTexture {
  const gfx = new PIXI.Graphics();
  const steps = 16;
  for (let i = steps; i >= 0; i--) {
    const r = (size / 2) * (i / steps);
    const alpha = 0.4 * (1 - i / steps);
    gfx.beginFill(0xffffff, alpha);
    gfx.drawEllipse(size / 2, size / 4, r, r * 0.4);
    gfx.endFill();
  }
  const rt = PIXI.RenderTexture.create({ width: size, height: size / 2 });
  app.renderer.render(gfx, { renderTexture: rt });
  gfx.destroy();
  return rt;
}

function buildParticleTexture(app: PIXI.Application): PIXI.RenderTexture {
  const gfx = new PIXI.Graphics();
  gfx.beginFill(0xffffff);
  gfx.drawCircle(4, 4, 4);
  gfx.endFill();
  const rt = PIXI.RenderTexture.create({ width: 8, height: 8 });
  app.renderer.render(gfx, { renderTexture: rt });
  gfx.destroy();
  return rt;
}

// --- Scene setup ---

interface SceneRefs {
  haloTexture: PIXI.RenderTexture;
  particleTexture: PIXI.RenderTexture;
  holoRing: PIXI.Graphics;
  centerIcon: PIXI.Sprite;
  agentLayer: PIXI.Container;
  particleLayer: PIXI.ParticleContainer;
  hudText: { agents: PIXI.Text; timer: PIXI.Text };
  dataRain: Array<{ text: PIXI.Text; vy: number; phase: number }>;
  ambientParticles: Array<{ s: PIXI.Sprite; vx: number; vy: number; phase: number }>;
}

function buildScene(app: PIXI.Application, offsetX: number, offsetY: number, canvasHeight: number): SceneRefs {
  const bgLayer = new PIXI.Container();
  const floorFxLayer = new PIXI.Container();
  const agentLayer = new PIXI.Container();
  const particleLayer = new PIXI.ParticleContainer(600, {
    position: true, alpha: true, tint: true, scale: true,
  });
  const overlayLayer = new PIXI.Container();
  app.stage.addChild(bgLayer, floorFxLayer, agentLayer, particleLayer, overlayLayer);

  // === WALLS ===
  const walls = new PIXI.Graphics();
  bgLayer.addChild(walls);

  for (let gy = 0; gy < GRID_SIZE; gy++) {
    const { sx, sy } = isoToScreen(0, gy, offsetX, offsetY);
    const { sx: sx2, sy: sy2 } = isoToScreen(0, gy + 1, offsetX, offsetY);
    walls.beginFill(WALL_FACE);
    walls.drawPolygon([sx, sy, sx2, sy2, sx2, sy2 - WALL_HEIGHT, sx, sy - WALL_HEIGHT]);
    walls.endFill();
    for (let h = 12; h < WALL_HEIGHT; h += 14) {
      walls.lineStyle(0.6, NEON_CYAN, 0.05);
      walls.moveTo(sx, sy - h); walls.lineTo(sx2, sy2 - h);
    }
    if (gy % 2 === 0) {
      const mx = (sx + sx2) / 2, my = (sy + sy2) / 2;
      walls.lineStyle(0.8, NEON_CYAN, 0.08);
      walls.moveTo(mx, my - 8); walls.lineTo(mx, my - WALL_HEIGHT + 8);
      walls.lineStyle(0);
      walls.beginFill(NEON_CYAN, 0.18);
      walls.drawCircle(mx, my - WALL_HEIGHT / 2, 1.5);
      walls.endFill();
    }
  }

  for (let gx = 0; gx < GRID_SIZE; gx++) {
    const { sx, sy } = isoToScreen(gx, 0, offsetX, offsetY);
    const { sx: sx2, sy: sy2 } = isoToScreen(gx + 1, 0, offsetX, offsetY);
    walls.beginFill(WALL_SIDE);
    walls.drawPolygon([sx, sy, sx2, sy2, sx2, sy2 - WALL_HEIGHT, sx, sy - WALL_HEIGHT]);
    walls.endFill();
    for (let h = 12; h < WALL_HEIGHT; h += 14) {
      walls.lineStyle(0.6, NEON_PURPLE, 0.05);
      walls.moveTo(sx, sy - h); walls.lineTo(sx2, sy2 - h);
    }
    if (gx % 2 === 0) {
      const mx = (sx + sx2) / 2, my = (sy + sy2) / 2;
      walls.lineStyle(0.8, NEON_PURPLE, 0.08);
      walls.moveTo(mx, my - 8); walls.lineTo(mx, my - WALL_HEIGHT + 8);
      walls.lineStyle(0);
      walls.beginFill(NEON_PURPLE, 0.18);
      walls.drawCircle(mx, my - WALL_HEIGHT / 2, 1.5);
      walls.endFill();
    }
  }

  // Wall top neon edges with glow
  const wallEdges = new PIXI.Graphics();
  const corner = isoToScreen(0, 0, offsetX, offsetY);
  wallEdges.lineStyle(1.8, NEON_CYAN, 1);
  for (let gy = 0; gy <= GRID_SIZE; gy++) {
    const { sx, sy } = isoToScreen(0, gy, offsetX, offsetY);
    if (gy === 0) wallEdges.moveTo(sx, sy - WALL_HEIGHT);
    else wallEdges.lineTo(sx, sy - WALL_HEIGHT);
  }
  wallEdges.lineStyle(1.8, NEON_PURPLE, 1);
  for (let gx = 0; gx <= GRID_SIZE; gx++) {
    const { sx, sy } = isoToScreen(gx, 0, offsetX, offsetY);
    if (gx === 0) wallEdges.moveTo(sx, sy - WALL_HEIGHT);
    else wallEdges.lineTo(sx, sy - WALL_HEIGHT);
  }
  wallEdges.lineStyle(0);
  wallEdges.beginFill(NEON_CYAN, 1);
  wallEdges.drawCircle(corner.sx, corner.sy - WALL_HEIGHT, 4);
  wallEdges.endFill();
  wallEdges.filters = [new GlowFilter({ distance: 14, outerStrength: 2.5, color: NEON_CYAN, quality: 0.3 })];
  bgLayer.addChild(wallEdges);

  // Corner vertical beam
  const beam = new PIXI.Graphics();
  beam.lineStyle(1.5, NEON_CYAN, 0.18);
  beam.moveTo(corner.sx, corner.sy - WALL_HEIGHT - 16);
  beam.lineTo(corner.sx, corner.sy);
  beam.filters = [new GlowFilter({ distance: 6, outerStrength: 1, color: NEON_CYAN, quality: 0.3 })];
  bgLayer.addChild(beam);

  // === FLOOR ===
  const floor = new PIXI.Graphics();
  bgLayer.addChild(floor);
  for (let gx = 0; gx < GRID_SIZE; gx++) {
    for (let gy = 0; gy < GRID_SIZE; gy++) {
      const isEven = (gx + gy) % 2 === 0;
      const { sx, sy } = isoToScreen(gx, gy, offsetX, offsetY);
      const pts = [sx, sy, sx + TILE_W / 2, sy + TILE_H / 2, sx, sy + TILE_H, sx - TILE_W / 2, sy + TILE_H / 2];
      const isAccent = gx % 4 === 0 || gy % 4 === 0;
      floor.lineStyle(isAccent ? 0.8 : 0.4, NEON_CYAN, isAccent ? 0.18 : 0.07);
      floor.beginFill(isEven ? FLOOR_DARK : FLOOR_LIGHT);
      floor.drawPolygon(pts);
      floor.endFill();
    }
  }

  // === FLOOR FX ===
  // Circuit traces
  const traces = new PIXI.Graphics();
  for (let i = 0; i < GRID_SIZE; i += 2) {
    const p1 = isoToScreen(i, 0, offsetX, offsetY);
    const p2 = isoToScreen(i, GRID_SIZE, offsetX, offsetY);
    traces.lineStyle(0.6, NEON_BLUE, 0.06);
    traces.moveTo(p1.sx, p1.sy + TILE_H / 2);
    traces.lineTo(p2.sx, p2.sy + TILE_H / 2);
  }
  for (let i = 0; i < GRID_SIZE; i += 2) {
    const p1 = isoToScreen(0, i, offsetX, offsetY);
    const p2 = isoToScreen(GRID_SIZE, i, offsetX, offsetY);
    traces.lineStyle(0.6, NEON_CYAN, 0.06);
    traces.moveTo(p1.sx, p1.sy + TILE_H / 2);
    traces.lineTo(p2.sx, p2.sy + TILE_H / 2);
  }
  floorFxLayer.addChild(traces);

  // Holo ring (animated each frame)
  const holoRing = new PIXI.Graphics();
  holoRing.filters = [new GlowFilter({ distance: 10, outerStrength: 1.5, color: NEON_CYAN, quality: 0.3 })];
  floorFxLayer.addChild(holoRing);

  // Center ground icon — flat on iso floor
  // Icon is 2516×1696 px; target ~88px wide on screen
  const ICON_NATIVE_W = 2516;
  const ICON_SCALE_X = 300 / ICON_NATIVE_W;
  const ICON_SCALE_Y = ICON_SCALE_X * 0.44;         // squish to lie flat on iso floor
  const centerPos = isoToScreen(GRID_SIZE / 2, GRID_SIZE / 2, offsetX, offsetY);
  const iconTex = PIXI.Texture.from("/app_icon.png");
  const centerIcon = new PIXI.Sprite(iconTex);
  centerIcon.anchor.set(0.5);
  centerIcon.x = centerPos.sx;
  centerIcon.y = centerPos.sy + TILE_H / 2;
  centerIcon.scale.set(ICON_SCALE_X, ICON_SCALE_Y);
  centerIcon.alpha = 0.9;
  // ADD blend: dark background vanishes, bright logo glows onto the floor
  centerIcon.blendMode = PIXI.BLEND_MODES.ADD;
  floorFxLayer.addChild(centerIcon);

  // Edge glows
  const edgeGlow = new PIXI.Graphics();
  const bl = isoToScreen(0, GRID_SIZE, offsetX, offsetY);
  const bot = isoToScreen(GRID_SIZE, GRID_SIZE, offsetX, offsetY);
  const br = isoToScreen(GRID_SIZE, 0, offsetX, offsetY);
  edgeGlow.lineStyle(1.5, NEON_CYAN, 0.25);
  edgeGlow.moveTo(bl.sx, bl.sy + TILE_H / 2);
  edgeGlow.lineTo(bot.sx, bot.sy + TILE_H / 2);
  edgeGlow.lineStyle(1.5, NEON_PURPLE, 0.25);
  edgeGlow.moveTo(br.sx, br.sy + TILE_H / 2);
  edgeGlow.lineTo(bot.sx, bot.sy + TILE_H / 2);
  edgeGlow.filters = [new GlowFilter({ distance: 6, outerStrength: 1, color: NEON_CYAN, quality: 0.3 })];
  floorFxLayer.addChild(edgeGlow);

  // === AMBIENT PARTICLES ===
  const particleTexture = buildParticleTexture(app);
  const ambientParticles: SceneRefs["ambientParticles"] = [];
  for (let i = 0; i < 40; i++) {
    const s = new PIXI.Sprite(particleTexture);
    s.anchor.set(0.5);
    s.x = Math.random() * app.renderer.width;
    s.y = Math.random() * canvasHeight;
    s.scale.set(0.15 + Math.random() * 0.2);
    s.tint = Math.random() > 0.5 ? NEON_CYAN : NEON_PURPLE;
    s.alpha = 0.15 + Math.random() * 0.2;
    s.blendMode = PIXI.BLEND_MODES.ADD;
    particleLayer.addChild(s);
    ambientParticles.push({
      s,
      vx: (Math.random() - 0.5) * 8,
      vy: -(8 + Math.random() * 12),
      phase: Math.random() * Math.PI * 2,
    });
  }

  // === DATA RAIN ===
  const CHARS = "01アイウエオカキクケコ>>=::";
  const dataRain: SceneRefs["dataRain"] = [];
  for (let i = 0; i < 30; i++) {
    const isCyan = Math.random() > 0.5;
    const t = new PIXI.Text(CHARS[Math.floor(Math.random() * CHARS.length)], {
      fontFamily: "monospace",
      fontSize: 7,
      fill: isCyan ? NEON_CYAN : NEON_PURPLE,
    });
    t.x = Math.random() * app.renderer.width;
    t.y = Math.random() * canvasHeight;
    t.alpha = 0.08 + Math.random() * 0.12;
    overlayLayer.addChild(t);
    dataRain.push({ text: t, vy: 0.3 + Math.random() * 0.8, phase: Math.random() * Math.PI * 2 });
  }

  // === HUD ===
  const hud = new PIXI.Graphics();
  const W = app.renderer.width;
  const H = canvasHeight;
  const bLen = 20;
  hud.lineStyle(1.2, NEON_CYAN, 0.45);
  hud.moveTo(8, 8 + bLen); hud.lineTo(8, 8); hud.lineTo(8 + bLen, 8);
  hud.moveTo(W - 8 - bLen, 8); hud.lineTo(W - 8, 8); hud.lineTo(W - 8, 8 + bLen);
  hud.moveTo(8, H - 8 - bLen); hud.lineTo(8, H - 8); hud.lineTo(8 + bLen, H - 8);
  hud.moveTo(W - 8 - bLen, H - 8); hud.lineTo(W - 8, H - 8); hud.lineTo(W - 8, H - 8 - bLen);
  overlayLayer.addChild(hud);

  const agentsText = new PIXI.Text("AGENTS: 0", { fontFamily: "monospace", fontSize: 8, fill: NEON_CYAN });
  agentsText.x = 14; agentsText.y = 14;
  const sysText = new PIXI.Text("SYS: ONLINE", { fontFamily: "monospace", fontSize: 8, fill: NEON_CYAN });
  sysText.x = 14; sysText.y = 25; sysText.alpha = 0.3;
  const timerText = new PIXI.Text("T:0000", { fontFamily: "monospace", fontSize: 8, fill: NEON_PURPLE });
  timerText.anchor.x = 1; timerText.x = W - 14; timerText.y = 14;
  const scanText = new PIXI.Text("SCAN: ACTIVE", { fontFamily: "monospace", fontSize: 8, fill: NEON_PURPLE });
  scanText.anchor.x = 1; scanText.x = W - 14; scanText.y = 25; scanText.alpha = 0.3;
  overlayLayer.addChild(agentsText, sysText, timerText, scanText);

  // Scanlines
  const scanlines = new PIXI.Graphics();
  scanlines.beginFill(0x000000, 0.03);
  for (let y = 0; y < canvasHeight; y += 2) scanlines.drawRect(0, y, app.renderer.width, 1);
  scanlines.endFill();
  overlayLayer.addChild(scanlines);

  // Vignette
  const vig = new PIXI.Graphics();
  const vcx = W / 2, vcy = H / 2;
  const maxR = Math.sqrt(vcx * vcx + vcy * vcy);
  for (let step = 8; step >= 1; step--) {
    vig.beginFill(0x000000, 0.06 * (1 - step / 8));
    vig.drawEllipse(vcx, vcy, maxR * (step / 8), maxR * 0.6 * (step / 8));
    vig.endFill();
  }
  overlayLayer.addChild(vig);

  const haloTexture = buildHaloTexture(app, 80);

  // Suppress unused warning — bloom is imported for potential future use
  void BloomFilter;

  return {
    haloTexture,
    particleTexture,
    holoRing,
    centerIcon,
    agentLayer,
    particleLayer,
    hudText: { agents: agentsText, timer: timerText },
    dataRain,
    ambientParticles,
  };
}

// --- Component ---

interface AgentRoomProps {
  agents: Agent[];
}

export function AgentRoom({ agents }: AgentRoomProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<PIXI.Application | null>(null);
  const sceneRef = useRef<SceneRefs | null>(null);
  const wanderRef = useRef<Map<string, WanderState>>(new Map());
  const agentsRef = useRef<Agent[]>(agents);
  agentsRef.current = agents;
  const globalPulseRef = useRef(0);
  const walkParticlesRef = useRef<Particle[]>([]);

  // Init PixiJS app once
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const cw = container.clientWidth || 480;
    const ch = Math.round(cw * CANVAS_ASPECT);
    const app = new PIXI.Application({
      width: cw,
      height: ch,
      backgroundColor: BG_COLOR,
      antialias: false,
      resolution: 1,
    });
    appRef.current = app;

    const canvas = app.view as HTMLCanvasElement;
    canvas.style.width = "100%";
    canvas.style.height = `${ch}px`;
    canvas.style.imageRendering = "pixelated";
    container.appendChild(canvas);

    const gridPixelWidth = GRID_SIZE * TILE_W + TILE_W;
    const scale = Math.min(1, cw / gridPixelWidth);
    const scaledCw = scale < 1 ? cw / scale : cw;
    const offsetX = scaledCw / 2;
    const offsetY = WALL_HEIGHT + 16;

    if (scale < 1) {
      app.stage.scale.set(scale);
    }

    const scene = buildScene(app, offsetX, offsetY, ch);
    sceneRef.current = scene;

    const cx = isoToScreen(GRID_SIZE / 2, GRID_SIZE / 2, offsetX, offsetY).sx;
    const cy = isoToScreen(GRID_SIZE / 2, GRID_SIZE / 2, offsetX, offsetY).sy + TILE_H / 2;

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const newW = entry.contentRect.width;
        const newH = Math.round(newW * CANVAS_ASPECT);
        app.renderer.resize(newW, newH);
        (app.view as HTMLCanvasElement).style.height = `${newH}px`;
        scene.hudText.timer.x = newW - 14;
      }
    });
    ro.observe(container);

    app.ticker.add((delta) => {
      const dt = delta / 60;
      globalPulseRef.current += dt;
      const pulse = globalPulseRef.current;
      const sinP = 0.5 + 0.5 * Math.sin(pulse * 0.8);

      // Animate holo ring
      const { holoRing } = scene;
      holoRing.clear();
      const sweep = pulse * 0.4;
      holoRing.lineStyle(1.5, NEON_CYAN, 0.12 + 0.08 * sinP);
      holoRing.drawEllipse(cx, cy, TILE_W * 2, TILE_H * 2);
      holoRing.lineStyle(1, NEON_PURPLE, 0.10 + 0.05 * sinP);
      holoRing.drawEllipse(cx, cy, TILE_W * 1.2, TILE_H * 1.2);
      holoRing.lineStyle(0.8, NEON_CYAN, 0.08 + 0.04 * sinP);
      holoRing.drawEllipse(cx, cy, TILE_W * 0.5, TILE_H * 0.5);
      // Clockwise scan arc
      holoRing.lineStyle(2, NEON_CYAN, 0.4 + 0.2 * sinP);
      for (let i = 0; i < 12; i++) {
        const a1 = sweep + (i / 12) * 0.8;
        const a2 = sweep + ((i + 1) / 12) * 0.8;
        holoRing.moveTo(cx + Math.cos(a1) * TILE_W * 1.6, cy + Math.sin(a1) * TILE_H * 1.6);
        holoRing.lineTo(cx + Math.cos(a2) * TILE_W * 1.6, cy + Math.sin(a2) * TILE_H * 1.6);
      }
      // Counter-clockwise scan arc (purple, slightly larger ring)
      const sweepCCW = -pulse * 0.25;
      holoRing.lineStyle(1.5, NEON_PURPLE, 0.3 + 0.15 * sinP);
      for (let i = 0; i < 10; i++) {
        const a1 = sweepCCW + (i / 10) * 0.6;
        const a2 = sweepCCW + ((i + 1) / 10) * 0.6;
        holoRing.moveTo(cx + Math.cos(a1) * TILE_W * 1.85, cy + Math.sin(a1) * TILE_H * 1.85);
        holoRing.lineTo(cx + Math.cos(a2) * TILE_W * 1.85, cy + Math.sin(a2) * TILE_H * 1.85);
      }
      holoRing.lineStyle(0);
      holoRing.beginFill(NEON_CYAN, 0.3 + 0.2 * sinP);
      holoRing.drawCircle(cx, cy, 3);
      holoRing.endFill();

      // Pulse center icon alpha only
      scene.centerIcon.alpha = 0.6 + 0.2 * sinP;

      // Data rain
      const W = app.renderer.width;
      for (const p of scene.dataRain) {
        p.text.y += p.vy * dt * 30;
        p.text.alpha = 0.07 + 0.06 * Math.sin(pulse * 0.6 + p.phase);
        if (p.text.y > app.renderer.height) { p.text.y = -8; p.text.x = Math.random() * W; }
      }

      // Ambient embers
      for (const p of scene.ambientParticles) {
        p.s.x += (p.vx + Math.sin(pulse * 0.2 + p.phase) * 3) * dt;
        p.s.y += p.vy * dt;
        p.s.alpha = 0.15 + 0.1 * Math.sin(pulse * 0.5 + p.phase);
        if (p.s.y < -8) { p.s.y = app.renderer.height + 4; p.s.x = Math.random() * W; }
        if (p.s.x < 0) p.s.x = W;
        if (p.s.x > W) p.s.x = 0;
      }

      // HUD
      scene.hudText.agents.alpha = 0.35 + 0.15 * Math.sin(pulse);
      scene.hudText.timer.alpha = 0.3 + 0.1 * Math.sin(pulse * 0.9);
      scene.hudText.timer.text = `T:${String(Math.floor(pulse * 10) % 10000).padStart(4, "0")}`;

      // Update wander states
      const map = wanderRef.current;
      const now = performance.now();
      for (const state of map.values()) {
        if (now < state.pauseUntil) {
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
          state.pauseUntil = now + randomPause();
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

      // Depth-sort and position agent objects
      const sorted = [...map.values()].sort((a, b) => (a.gx + a.gy) - (b.gx + b.gy));
      scene.agentLayer.removeChildren();
      for (const state of sorted) {
        const { sx, sy } = isoToScreen(state.gx, state.gy, offsetX, offsetY);

        // Shadow
        state.shadowGfx.clear();
        state.shadowGfx.beginFill(0x00c8ff, 0.12);
        state.shadowGfx.drawEllipse(sx, sy + 4, 18, 7);
        state.shadowGfx.endFill();
        scene.agentLayer.addChild(state.shadowGfx);

        // Halo
        const walking = state.isWalking;
        state.haloSprite.x = sx;
        state.haloSprite.y = sy - 4;
        state.haloSprite.scale.set(walking ? 1.15 : 0.9);
        state.haloSprite.alpha = walking ? 0.75 : 0.4;
        scene.agentLayer.addChild(state.haloSprite);

        // Sprite with bounce
        const wf = walking ? Math.floor(state.walkTime * WALK_CYCLE_SPEED) % 4 : 0;
        const bounce = (wf === 1 || wf === 3) ? -2 : 0;
        const rendered = SPRITE_SIZE * SPRITE_SCALE;
        state.agentSprite.x = Math.round(sx - rendered / 2);
        state.agentSprite.y = Math.round(sy - rendered + bounce);
        scene.agentLayer.addChild(state.agentSprite);

        // Walk trail particles
        if (walking && Math.random() < 0.35) {
          const trail = new PIXI.Sprite(scene.particleTexture);
          trail.anchor.set(0.5);
          trail.x = sx + (Math.random() - 0.5) * 10;
          trail.y = sy + (Math.random() - 0.5) * 4;
          trail.scale.set(0.18 + Math.random() * 0.14);
          trail.tint = roleColor(state.role);
          trail.alpha = 0.65;
          trail.blendMode = PIXI.BLEND_MODES.ADD;
          scene.particleLayer.addChild(trail);
          walkParticlesRef.current.push({ sprite: trail, vx: (Math.random() - 0.5) * 20, vy: -6 - Math.random() * 10, life: 0.5, maxLife: 0.5 });
        }
      }

      // Decay walk trail particles
      const alive: Particle[] = [];
      for (const p of walkParticlesRef.current) {
        p.life -= dt;
        if (p.life <= 0) { p.sprite.destroy(); continue; }
        p.sprite.x += p.vx * dt;
        p.sprite.y += p.vy * dt;
        p.sprite.alpha = (p.life / p.maxLife) * 0.6;
        alive.push(p);
      }
      walkParticlesRef.current = alive;

      scene.hudText.agents.text = `AGENTS: ${map.size}`;
    });

    return () => {
      ro.disconnect();
      app.ticker.stop();
      for (const p of walkParticlesRef.current) p.sprite.destroy();
      walkParticlesRef.current = [];
      wanderRef.current.clear();
      app.destroy(true, { children: true, texture: true, baseTexture: true });
      appRef.current = null;
      sceneRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync agents prop → wander states
  useEffect(() => {
    const app = appRef.current;
    const scene = sceneRef.current;
    if (!app || !scene) return;

    const map = wanderRef.current;
    const ids = new Set(agents.map((a) => a.id));

    for (const [id, state] of map.entries()) {
      if (!ids.has(id)) {
        state.shadowGfx.destroy();
        state.haloSprite.destroy();
        state.agentSprite.destroy();
        state.agentTexture.destroy(true);
        map.delete(id);
      }
    }

    for (const agent of agents) {
      if (map.has(agent.id)) continue;
      const others = [...map.values()];
      const start = pickNonOverlappingTile(others);
      const target = pickNonOverlappingTile(others);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const spriteData = generateSpriteData(agent.spriteSeed as any, agent.role);
      const tex = buildAgentTexture(app, spriteData);

      const agentSpr = new PIXI.Sprite(tex);
      agentSpr.scale.set(SPRITE_SCALE);
      agentSpr.filters = [new GlowFilter({ distance: 6, outerStrength: 1.2, color: roleColor(agent.role), quality: 0.3 })];

      const haloSpr = new PIXI.Sprite(scene.haloTexture);
      haloSpr.anchor.set(0.5);
      haloSpr.tint = roleColor(agent.role);
      haloSpr.blendMode = PIXI.BLEND_MODES.ADD;

      const shadowGfx = new PIXI.Graphics();

      map.set(agent.id, {
        gx: start.gx, gy: start.gy,
        targetGx: target.gx, targetGy: target.gy,
        speed: randomSpeed(),
        pauseUntil: performance.now() + Math.random() * MAX_INITIAL_DELAY,
        sprite: spriteData,
        walkTime: 0,
        isWalking: false,
        role: agent.role,
        shadowGfx,
        haloSprite: haloSpr,
        agentSprite: agentSpr,
        agentTexture: tex,
      });
    }
  }, [agents]);

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", overflow: "hidden", display: "block" }}
    />
  );
}
