# Isometric Agent Room — Design Doc

## Goal

Replace the static agent icon row on the Dashboard with a decorative isometric pixel-art room where player agents wander around randomly, giving a lively 3D feel.

## Decisions

- **Style:** Isometric pixel room (RPG/Habbo-style), matching existing pixel sprite aesthetic
- **Movement:** Random wandering — agents pick a random tile, walk to it, pause, repeat
- **Interaction:** Decorative only — the existing clickable agent row stays below for navigation
- **Size:** Hero section (~300-350px tall), spacious enough for agents to roam
- **Rendering:** Full canvas-based — floor, walls, and agents all drawn on one `<canvas>`

## Room Structure

- Canvas element, ~600×320px (responsive width, fixed aspect ratio)
- Isometric diamond floor: 8×8 tile grid, tile size 32×16px (2:1 iso ratio)
- Floor tiles: alternating dark tones (#1a1a2e / #16162a) for subtle checkerboard
- Back walls on top-left and top-right edges, 2-3 tiles tall, slightly lighter shade
- Isometric conversion:
  - `screenX = (x - y) * tileWidth/2 + offsetX`
  - `screenY = (x + y) * tileHeight/2 + offsetY`

## Agent Movement & Animation

- Each agent picks a random tile target, moves at ~1 tile/sec
- On arrival, pauses 1-3 seconds (random), then picks new target
- Agents move independently, no collision detection
- Sprite rendering reuses `generateSpriteData()` for each agent's 32×32 pixel grid
- Small elliptical shadow beneath each agent
- Depth sorting: sort by world y (then x) each frame, draw back-to-front
- Animation via `requestAnimationFrame` with delta-time for smooth motion

## Component

- New file: `src/components/AgentRoom.tsx`
- Props: `agents: Agent[]`
- Manages canvas, animation loop, movement state internally
- Cleans up requestAnimationFrame on unmount
- Only renders when agents.length > 0

## Dashboard Integration

Layout order:
1. Player Profile
2. PlayerStats
3. **AgentRoom** (new, decorative)
4. My Agents row (existing, clickable — unchanged)
5. DailyTasks
6. Action buttons

## No Changes To

- PixelSprite component
- Agent data model
- Any other pages
