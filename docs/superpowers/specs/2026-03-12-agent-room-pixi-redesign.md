# Agent Room — PixiJS Redesign

**Date:** 2026-03-12
**Status:** Approved

## Overview

Replace the existing Canvas 2D API–based `AgentRoom` component with a PixiJS (WebGL) renderer that delivers richer cyberpunk visuals: real bloom/glow filters, particle walk trails, ambient floating embers, role-colored agent halos, and taller walls — while remaining a drop-in replacement for the dashboard and working inside the Android WebView (Expo React Native app on Solana Seeker phone).

## Background

### Why not Godot HTML5 embed?

The Android APK is an Expo/React Native app that loads the Next.js web app inside a `react-native-webview`. Android WebView blocks `SharedArrayBuffer`, which Godot 4.x HTML5 exports require. Godot WASM exports are also 30–50 MB — too heavy for a UI panel. PixiJS is the correct alternative: ~500 KB, WebGL-accelerated, works in Android WebView.

### Current implementation

`src/components/AgentRoom.tsx` is ~810 lines of raw Canvas 2D API code with:
- Isometric floor tiles (8×8 grid)
- Cyberpunk walls with circuit traces
- Agent pixel sprites that wander with a walk cycle
- Holographic center ring, data rain, HUD overlay, scanlines, vignette
- Custom `requestAnimationFrame` loop

## Goals

1. Upgrade visual quality to match a game-engine aesthetic — bloom, particles, glow
2. Keep identical props interface (`agents: Agent[]`) — zero dashboard changes
3. Maintain 60fps on the Seeker phone (Android WebView)
4. Keep `"use client"` boundary; no SSR concerns

## Non-Goals

- True 3D geometry (Three.js, WebGPU)
- Changing the isometric layout or grid size
- Modifying the `AgentCard`, `PixelSprite`, or dashboard layout
- Adding agent stats/info overlays inside the room

## Architecture

### Layer stack (PixiJS Containers, back to front)

```
PIXI.Application (WebGL canvas, 200px height, full width)
├── Layer 0 — Background     walls + floor tiles (PIXI.Graphics)
├── Layer 1 — Floor FX       holo ring, edge glows, circuit traces (PIXI.Graphics)
├── Layer 2 — Agent Shadows  ellipse shadows depth-sorted (PIXI.Graphics)
├── Layer 3 — Agent Glows    role-colored radial halo sprites (PIXI.Sprite)
├── Layer 4 — Agent Sprites  pixel art sprites depth-sorted by gx+gy (PIXI.Sprite)
├── Layer 5 — Particles      walk trails + ambient embers (PIXI.ParticleContainer)
└── Layer 6 — Overlay        HUD brackets, data rain text, scanlines, vignette
```

### React integration

```tsx
// Public API — unchanged
<AgentRoom agents={agents} />
```

- `useEffect` creates `PIXI.Application` on mount, destroys on unmount
- `ResizeObserver` calls `app.renderer.resize(width, 200)` on parent resize
- Agent wander logic (position, walk cycle, pause/move) stays identical to current implementation
- PixiJS `app.ticker` replaces `requestAnimationFrame`

### New packages

| Package | Purpose | Size (gzip) |
|---|---|---|
| `pixi.js` v7 | WebGL renderer, containers, graphics | ~450 KB |
| `@pixi/filter-bloom` | Bloom post-process filter | ~8 KB |
| `@pixi/filter-glow` | Glow filter for neon edges | ~6 KB |

Total addition: ~465 KB gzip. No other dependencies.

## Visual Effects

### ① Taller walls
- Wall height increased from `32px` to `72px` (isometric units)
- Same back-left (purple) / back-right (cyan) two-wall layout
- Horizontal circuit traces + vertical nodes, pulsing alpha via ticker

### ② Real bloom/glow on neon edges
- Wall top edges rendered with `@pixi/filter-glow` (outerStrength: 3, color: cyan/purple)
- Corner node uses `@pixi/filter-bloom`
- Floor edge glows use additive blending (`PIXI.BLEND_MODES.ADD`)

### ③ Floor grid
- Same isometric diamond tiles, rendered via `PIXI.Graphics`
- Accent tiles (every 4th row/col) drawn with slightly higher alpha
- WebGL rendering gives sharper edges on HiDPI screens

### ④ Holographic center ring
- Concentric ellipses at grid center, rendered via `PIXI.Graphics`
- Scan arc segment advances each ticker tick (`rotation += 0.4 * dt`)
- Scan arc uses `@pixi/filter-glow`

### ⑤ Agent shadows
- Cyan ellipse under each agent at floor level
- Alpha pulses: `0.1 + 0.08 * sin(globalPulse * 1.2)` when walking, dimmer when paused

### ⑥ Role-colored agent glow halos
- Pre-baked radial gradient `RenderTexture` per role color (generated once at init)
- Placed under sprite, scale `1.0` idle → `1.2` walking
- Colors: mage = `#a855f7`, scout = `#06b6d4`, warrior = `#f59e0b`, default = `#00ffff`

### ⑦ Particle walk trails
- `PIXI.ParticleContainer` with pool of 200 particles
- Emits 2–3 particles/frame per walking agent from foot position
- Particle: small circle sprite, color matches agent role, life 0.5s, alpha fades out, drifts backward along movement vector
- Idle agents emit zero particles

### ⑧ Ambient ember particles
- 40 particles in a shared `PIXI.ParticleContainer`
- Float upward slowly (`vy = -8 to -20 px/s`), slight sine drift on x
- Cyan and purple, alpha `0.15–0.35`, wrap when reaching top of canvas
- Uses additive blending for glow-without-overdraw

### ⑨ Data rain (walls)
- `PIXI.Text` objects with monospace font, cyan/purple, low alpha
- Same character set as current: `"01アイウエオカキクケコ>>=::"`
- Pool of 30 text objects, positions recycled as they drift off screen

### ⑩ HUD overlay
- `PIXI.Graphics` corner brackets (top-left, top-right, bottom-left, bottom-right)
- `PIXI.Text` for `AGENTS: N`, `SYS: ONLINE`, `T:XXXX`, `SCAN: ACTIVE`
- Bracket alpha pulses gently

### ⑪ Scanlines + vignette
- Scanlines: semi-transparent horizontal Graphics lines (every 2px), drawn once to `RenderTexture`, reused each frame
- Vignette: radial gradient `RenderTexture` (black transparent → black 45%), drawn as full-canvas sprite on top

## Performance Considerations

- All `RenderTexture` assets (glow halos, scanlines, vignette) generated once at init, never re-created
- `ParticleContainer` uses `batchSize: 200` — single draw call for all particles
- Agent sprite pixel art rendered to `RenderTexture` once per agent (same as current `OffscreenCanvas` approach)
- Target: 60fps on mid-range Android (Snapdragon 8 Gen series in Seeker phone)
- If frame budget exceeded: particle count halved, bloom disabled — but this should not be needed

## File Changes

| File | Change |
|---|---|
| `src/components/AgentRoom.tsx` | Full rewrite using PixiJS |
| `package.json` | Add `pixi.js`, `@pixi/filter-bloom`, `@pixi/filter-glow` |
| `pnpm-lock.yaml` | Updated by pnpm |

No other files change.

## Testing

- Visual check in browser (Next.js dev server)
- Visual check on Android WebView via the Expo APK
- Confirm 0 agents → renders nothing (same as current)
- Confirm agents array update triggers new wander states (same logic)
- Confirm resize works on window resize and device rotation
