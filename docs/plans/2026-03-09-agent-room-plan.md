# Isometric Agent Room Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a decorative isometric pixel-art room to the Dashboard where player agents wander around randomly.

**Architecture:** A single canvas-based React component (`AgentRoom`) renders an isometric diamond floor, back walls, and animated agent sprites. Agents use `generateSpriteData()` from the existing sprite renderer. Movement is random wandering with `requestAnimationFrame`. The room sits above the existing clickable agent row on the Dashboard.

**Tech Stack:** React, Canvas API, requestAnimationFrame, existing `generateSpriteData()` from `src/lib/sprite-renderer.ts`

---

### Task 1: Create the AgentRoom component with isometric floor rendering

**Files:**
- Create: `src/components/AgentRoom.tsx`

**Step 1: Create the component with canvas and floor drawing**

Create `src/components/AgentRoom.tsx` with the following:

```tsx
"use client";
import { useRef, useEffect, useState } from "react";
import { generateSpriteData } from "@/lib/sprite-renderer";
import type { Agent, RoleCategory } from "@/lib/types";

// --- Isometric constants ---
const TILE_W = 32;
const TILE_H = 16;
const GRID_COLS = 8;
const GRID_ROWS = 8;
const CANVAS_H = 320;
const FLOOR_COLORS = ["#1a1a2e", "#16162a"];
const WALL_COLOR = "#222244";
const WALL_TOP_COLOR = "#2a2a50";
const SHADOW_COLOR = "rgba(0,0,0,0.35)";

// Convert grid coords to screen coords
function toScreen(gx: number, gy: number, offsetX: number, offsetY: number) {
  return {
    x: (gx - gy) * (TILE_W / 2) + offsetX,
    y: (gx + gy) * (TILE_H / 2) + offsetY,
  };
}

// --- Agent movement state ---
interface WanderAgent {
  agent: Agent;
  spriteData: (string | null)[][];
  // Current world position (fractional grid coords)
  wx: number;
  wy: number;
  // Target grid position
  tx: number;
  ty: number;
  // Pause timer (seconds remaining)
  pause: number;
  // Speed (tiles per second)
  speed: number;
}

function randomTile() {
  return {
    x: 1 + Math.random() * (GRID_COLS - 2),
    y: 1 + Math.random() * (GRID_ROWS - 2),
  };
}

function pickNewTarget(wa: WanderAgent) {
  const t = randomTile();
  wa.tx = t.x;
  wa.ty = t.y;
  wa.pause = 0;
}

interface AgentRoomProps {
  agents: Agent[];
}

export function AgentRoom({ agents }: AgentRoomProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [canvasW, setCanvasW] = useState(600);
  const wanderRef = useRef<WanderAgent[]>([]);
  const rafRef = useRef<number>(0);

  // Build / rebuild wander agents when agents list changes
  useEffect(() => {
    const existing = wanderRef.current;
    const newWander: WanderAgent[] = agents.map((agent) => {
      // Reuse existing position if same agent
      const prev = existing.find((w) => w.agent.id === agent.id);
      if (prev) return { ...prev, agent };

      const start = randomTile();
      const target = randomTile();
      return {
        agent,
        spriteData: generateSpriteData(
          agent.spriteSeed as any,
          agent.role as RoleCategory
        ),
        wx: start.x,
        wy: start.y,
        tx: target.x,
        ty: target.y,
        pause: Math.random() * 2,
        speed: 0.6 + Math.random() * 0.4,
      };
    });
    wanderRef.current = newWander;
  }, [agents]);

  // Resize observer for responsive width
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setCanvasW(Math.floor(entry.contentRect.width));
      }
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  // Main animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let lastTime = 0;

    function drawFloor(ctx: CanvasRenderingContext2D, offX: number, offY: number) {
      for (let gx = 0; gx < GRID_COLS; gx++) {
        for (let gy = 0; gy < GRID_ROWS; gy++) {
          const { x, y } = toScreen(gx, gy, offX, offY);
          const color = (gx + gy) % 2 === 0 ? FLOOR_COLORS[0] : FLOOR_COLORS[1];
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + TILE_W / 2, y + TILE_H / 2);
          ctx.lineTo(x, y + TILE_H);
          ctx.lineTo(x - TILE_W / 2, y + TILE_H / 2);
          ctx.closePath();
          ctx.fill();
          // Subtle grid edge
          ctx.strokeStyle = "rgba(255,255,255,0.04)";
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      }
    }

    function drawWalls(ctx: CanvasRenderingContext2D, offX: number, offY: number) {
      const wallH = 24;
      // Left wall (gy = 0 edge)
      for (let gx = 0; gx < GRID_COLS; gx++) {
        const { x, y } = toScreen(gx, 0, offX, offY);
        ctx.fillStyle = WALL_COLOR;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + TILE_W / 2, y + TILE_H / 2);
        ctx.lineTo(x + TILE_W / 2, y + TILE_H / 2 - wallH);
        ctx.lineTo(x, y - wallH);
        ctx.closePath();
        ctx.fill();
        // Top edge highlight
        ctx.fillStyle = WALL_TOP_COLOR;
        ctx.beginPath();
        ctx.moveTo(x, y - wallH);
        ctx.lineTo(x + TILE_W / 2, y + TILE_H / 2 - wallH);
        ctx.lineTo(x + TILE_W / 2, y + TILE_H / 2 - wallH - 3);
        ctx.lineTo(x, y - wallH - 3);
        ctx.closePath();
        ctx.fill();
      }
      // Right wall (gx = 0 edge)
      for (let gy = 0; gy < GRID_ROWS; gy++) {
        const { x, y } = toScreen(0, gy, offX, offY);
        ctx.fillStyle = WALL_COLOR;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - TILE_W / 2, y + TILE_H / 2);
        ctx.lineTo(x - TILE_W / 2, y + TILE_H / 2 - wallH);
        ctx.lineTo(x, y - wallH);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = WALL_TOP_COLOR;
        ctx.beginPath();
        ctx.moveTo(x, y - wallH);
        ctx.lineTo(x - TILE_W / 2, y + TILE_H / 2 - wallH);
        ctx.lineTo(x - TILE_W / 2, y + TILE_H / 2 - wallH - 3);
        ctx.lineTo(x, y - wallH - 3);
        ctx.closePath();
        ctx.fill();
      }
    }

    function drawShadow(ctx: CanvasRenderingContext2D, sx: number, sy: number) {
      ctx.fillStyle = SHADOW_COLOR;
      ctx.beginPath();
      ctx.ellipse(sx, sy + 2, 10, 4, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    function drawSprite(
      ctx: CanvasRenderingContext2D,
      spriteData: (string | null)[][],
      sx: number,
      sy: number
    ) {
      // Draw 32x32 sprite centered at (sx, sy - 16) so feet are at sy
      const startX = Math.round(sx - 16);
      const startY = Math.round(sy - 32);
      for (let py = 0; py < 32; py++) {
        for (let px = 0; px < 32; px++) {
          const color = spriteData[py][px];
          if (color) {
            ctx.fillStyle = color;
            ctx.fillRect(startX + px, startY + py, 1, 1);
          }
        }
      }
    }

    function frame(time: number) {
      const dt = lastTime === 0 ? 0.016 : Math.min((time - lastTime) / 1000, 0.1);
      lastTime = time;

      const w = canvasW;
      const h = CANVAS_H;
      canvas.width = w;
      canvas.height = h;

      // Center the floor diamond in the canvas
      const offX = w / 2;
      const offY = 50;

      ctx.clearRect(0, 0, w, h);

      // Draw room
      drawWalls(ctx, offX, offY);
      drawFloor(ctx, offX, offY);

      // Update agent positions
      const wanders = wanderRef.current;
      for (const wa of wanders) {
        if (wa.pause > 0) {
          wa.pause -= dt;
          continue;
        }
        const dx = wa.tx - wa.wx;
        const dy = wa.ty - wa.wy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 0.1) {
          // Arrived — pause then pick new target
          wa.wx = wa.tx;
          wa.wy = wa.ty;
          wa.pause = 1 + Math.random() * 2;
          pickNewTarget(wa);
        } else {
          const step = wa.speed * dt;
          wa.wx += (dx / dist) * Math.min(step, dist);
          wa.wy += (dy / dist) * Math.min(step, dist);
        }
      }

      // Sort by depth (y then x) for back-to-front drawing
      const sorted = [...wanders].sort((a, b) => {
        const depthA = a.wx + a.wy;
        const depthB = b.wx + b.wy;
        return depthA - depthB;
      });

      // Draw agents
      for (const wa of sorted) {
        const { x: sx, y: sy } = toScreen(wa.wx, wa.wy, offX, offY);
        drawShadow(ctx, sx, sy);
        drawSprite(ctx, wa.spriteData, sx, sy);
      }

      rafRef.current = requestAnimationFrame(frame);
    }

    rafRef.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafRef.current);
  }, [canvasW]);

  if (agents.length === 0) return null;

  return (
    <div ref={containerRef} className="w-full">
      <canvas
        ref={canvasRef}
        height={CANVAS_H}
        className="w-full rounded"
        style={{ imageRendering: "pixelated" }}
      />
    </div>
  );
}
```

**Step 2: Verify the component compiles**

Run: `npx tsc --noEmit 2>&1 | grep -i AgentRoom`
Expected: No errors related to AgentRoom (pre-existing sprite-renderer errors are OK)

**Step 3: Commit**

```bash
git add src/components/AgentRoom.tsx
git commit -m "feat: add AgentRoom component with isometric floor and wandering agents"
```

---

### Task 2: Integrate AgentRoom into the Dashboard

**Files:**
- Modify: `src/app/dashboard/page.tsx:46-67`

**Step 1: Add the AgentRoom import and render it**

In `src/app/dashboard/page.tsx`, add the import at the top:

```tsx
import { AgentRoom } from "@/components/AgentRoom";
```

Then insert the AgentRoom section between `<PlayerStats />` and the existing "My Agents" section. Find:

```tsx
      <PlayerStats />

      {/* My Agents */}
```

Replace with:

```tsx
      <PlayerStats />

      {/* Agent Room */}
      {agents.length > 0 && (
        <div className="mt-6 bg-gray-900 border border-gray-800 rounded p-4">
          <h2 className="text-lg font-mono font-bold text-white mb-3">Agent Room</h2>
          <AgentRoom agents={agents} />
        </div>
      )}

      {/* My Agents */}
```

**Step 2: Verify the page compiles**

Run: `npx tsc --noEmit 2>&1 | grep -i dashboard`
Expected: No errors related to dashboard

**Step 3: Visually test**

Run: `npm run dev`
Open the Dashboard page in browser. You should see:
- An isometric diamond floor with dark checkerboard tiles
- Back walls on the top-left and top-right edges
- Agent sprites placed on the floor, wandering to random tiles
- Existing agent row still visible below

**Step 4: Commit**

```bash
git add src/app/dashboard/page.tsx
git commit -m "feat: integrate AgentRoom into Dashboard page"
```

---

### Task 3: Polish and tune

**Files:**
- Modify: `src/components/AgentRoom.tsx`

**Step 1: Test with 0, 1, and many agents**

- 0 agents: Room should not render at all
- 1 agent: Should wander alone on the floor
- 4+ agents: Should all wander independently, depth-sorted correctly

**Step 2: Tune constants if needed**

Adjust these in `AgentRoom.tsx` if the visual balance is off:
- `CANVAS_H` (320) — room height
- `offY` (50) — vertical offset to center the diamond
- `TILE_W` / `TILE_H` — tile proportions
- `wa.speed` (0.6-1.0) — walking speed
- `wa.pause` (1-3 seconds) — idle time between walks
- Wall height `wallH` (24) — how tall back walls are

**Step 3: Final commit**

```bash
git add src/components/AgentRoom.tsx
git commit -m "fix: tune AgentRoom visual constants"
```
