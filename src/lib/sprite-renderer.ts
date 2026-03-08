import type { RoleCategory } from "./types";

type PixelGrid = (string | null)[][];

interface SpriteSeed {
  bodyType: number;
  headType: number;
  eyeType: number;
  weaponType: number;
  auraType: number;
  colorSeed: number;
}

function createGrid(): PixelGrid {
  return Array.from({ length: 32 }, () => Array(32).fill(null));
}

function setPixel(grid: PixelGrid, x: number, y: number, color: string) {
  if (x >= 0 && x < 32 && y >= 0 && y < 32) {
    grid[y][x] = color;
  }
}

function setMirror(grid: PixelGrid, cx: number, dx: number, y: number, color: string) {
  setPixel(grid, cx + dx, y, color);
  if (dx !== 0) setPixel(grid, cx - dx, y, color);
}

function hsl(h: number, s: number, l: number): string {
  h = ((h % 360) + 360) % 360;
  s /= 100;
  l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  const toHex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function getRolePalette(role: RoleCategory, colorSeed: number) {
  const shift = (colorSeed % 40) - 20;
  switch (role) {
    case "future":
      return {
        primary: hsl(180 + shift, 80, 55),
        secondary: hsl(270 + shift, 70, 50),
        accent: hsl(140 + shift, 90, 55),
        skin: hsl(180 + shift, 20, 80),
        dark: hsl(220 + shift, 50, 20),
        outline: hsl(210 + shift, 60, 15),
        highlight: hsl(180 + shift, 80, 75),
        glow: hsl(180 + shift, 90, 65),
      };
    case "modern":
      return {
        primary: hsl(210 + shift, 50, 50),
        secondary: hsl(0 + shift, 0, 60),
        accent: hsl(45 + shift, 80, 55),
        skin: hsl(25 + shift, 40, 70),
        dark: hsl(210 + shift, 30, 22),
        outline: hsl(210 + shift, 25, 15),
        highlight: hsl(210 + shift, 50, 70),
        glow: hsl(45 + shift, 80, 60),
      };
    case "medieval":
      return {
        primary: hsl(35 + shift, 70, 45),
        secondary: hsl(15 + shift, 50, 30),
        accent: hsl(0 + shift, 65, 50),
        skin: hsl(25 + shift, 45, 65),
        dark: hsl(20 + shift, 50, 15),
        outline: hsl(20 + shift, 40, 12),
        highlight: hsl(45 + shift, 70, 65),
        glow: hsl(0 + shift, 60, 55),
      };
  }
}

function seededRand(seed: number, i: number): number {
  const x = Math.sin(seed * 9301 + i * 49297 + 233280) * 49297;
  return x - Math.floor(x);
}

export function generateSpriteData(seed: SpriteSeed, role: RoleCategory): PixelGrid {
  const grid = createGrid();
  const p = getRolePalette(role, seed.colorSeed);
  const cx = 15;
  const rand = (i: number) => seededRand(seed.colorSeed + seed.bodyType * 7 + seed.headType * 13, i);

  // ===== BOOTS (y 26-28) =====
  const bootType = seed.bodyType % 3;
  if (bootType === 0) {
    for (const dx of [-2, -1, 2, 1]) {
      setPixel(grid, cx + dx, 26, p.dark);
      setPixel(grid, cx + dx, 27, p.dark);
    }
    setPixel(grid, cx - 3, 27, p.dark);
    setPixel(grid, cx + 3, 27, p.dark);
  } else if (bootType === 1) {
    for (const dx of [-2, -1, 2, 1]) {
      setPixel(grid, cx + dx, 26, p.dark);
      setPixel(grid, cx + dx, 27, p.dark);
    }
    setPixel(grid, cx - 3, 27, p.outline);
    setPixel(grid, cx + 3, 27, p.outline);
    setPixel(grid, cx - 1, 28, p.outline);
    setPixel(grid, cx + 1, 28, p.outline);
  } else {
    for (const dx of [-3, -2, -1, 1, 2, 3]) {
      setPixel(grid, cx + dx, 26, p.secondary);
      setPixel(grid, cx + dx, 27, p.dark);
    }
    setPixel(grid, cx - 2, 28, p.outline);
    setPixel(grid, cx + 2, 28, p.outline);
  }

  // ===== LEGS (y 22-25) =====
  for (let y = 22; y <= 25; y++) {
    setPixel(grid, cx - 2, y, p.primary);
    setPixel(grid, cx - 1, y, p.primary);
    setPixel(grid, cx + 1, y, p.primary);
    setPixel(grid, cx + 2, y, p.primary);
    setPixel(grid, cx - 3, y, p.outline);
    setPixel(grid, cx + 3, y, p.outline);
  }
  setPixel(grid, cx, 24, null);
  setPixel(grid, cx, 25, null);

  // ===== TORSO (y 14-21) =====
  const torsoType = seed.bodyType % 4;
  for (let y = 14; y <= 21; y++) {
    const widths = torsoType === 0 ? 3 : torsoType === 1 ? 4 : torsoType === 2 ? (y < 17 ? 4 : 3) : (y < 16 ? 5 : y < 19 ? 4 : 3);
    for (let dx = -(widths - 1); dx <= widths - 1; dx++) {
      setPixel(grid, cx + dx, y, p.primary);
    }
    setPixel(grid, cx - widths, y, p.outline);
    setPixel(grid, cx + widths, y, p.outline);
  }

  // Belt
  for (let dx = -3; dx <= 3; dx++) setPixel(grid, cx + dx, 20, p.accent);
  setPixel(grid, cx, 20, p.highlight);

  // Chest detail
  if (role === "future") {
    setPixel(grid, cx, 16, p.glow);
    setPixel(grid, cx - 1, 16, p.highlight);
    setPixel(grid, cx + 1, 16, p.highlight);
    setPixel(grid, cx, 17, p.highlight);
  } else if (role === "medieval") {
    setPixel(grid, cx, 15, p.accent);
    setPixel(grid, cx, 16, p.accent);
    setPixel(grid, cx, 17, p.accent);
    setPixel(grid, cx - 1, 16, p.accent);
    setPixel(grid, cx + 1, 16, p.accent);
  } else {
    setPixel(grid, cx, 14, p.accent);
    setPixel(grid, cx, 15, p.accent);
    setPixel(grid, cx - 1, 15, p.secondary);
    setPixel(grid, cx + 1, 15, p.secondary);
  }

  // ===== SHOULDERS & ARMS =====
  const shoulderWidth = torsoType === 3 ? 6 : 5;
  setMirror(grid, cx, shoulderWidth - 1, 14, p.secondary);
  setMirror(grid, cx, shoulderWidth, 14, p.secondary);
  setMirror(grid, cx, shoulderWidth, 15, p.secondary);

  for (let y = 15; y <= 21; y++) {
    setMirror(grid, cx, shoulderWidth - 1, y, p.primary);
    setMirror(grid, cx, shoulderWidth, y, p.outline);
  }
  setMirror(grid, cx, shoulderWidth - 1, 22, p.skin);
  setMirror(grid, cx, shoulderWidth, 22, p.skin);

  // ===== HEAD (y 5-13) =====
  const headType = seed.headType % 4;
  const headTop = headType === 0 ? 6 : headType === 1 ? 5 : headType === 2 ? 6 : 7;
  const headWidth = headType === 3 ? 4 : 3;

  // Neck
  for (let dx = -1; dx <= 1; dx++) setPixel(grid, cx + dx, 13, p.skin);

  // Head fill
  for (let y = headTop; y <= 12; y++) {
    const w = y <= headTop + 1 ? headWidth - 1 : headWidth;
    for (let dx = -w; dx <= w; dx++) setPixel(grid, cx + dx, y, p.skin);
    setPixel(grid, cx - w - 1, y, p.outline);
    setPixel(grid, cx + w + 1, y, p.outline);
  }
  for (let dx = -(headWidth - 1); dx <= headWidth - 1; dx++) setPixel(grid, cx + dx, headTop - 1, p.outline);

  // ===== EYES =====
  const eyeY = 9;
  const eyeType = seed.eyeType % 5;
  if (eyeType === 0) {
    setPixel(grid, cx - 2, eyeY, p.dark);
    setPixel(grid, cx + 2, eyeY, p.dark);
  } else if (eyeType === 1) {
    setPixel(grid, cx - 2, eyeY, p.glow);
    setPixel(grid, cx + 2, eyeY, p.glow);
    setPixel(grid, cx - 2, eyeY + 1, p.dark);
    setPixel(grid, cx + 2, eyeY + 1, p.dark);
  } else if (eyeType === 2) {
    setPixel(grid, cx - 2, eyeY, "#ffffff");
    setPixel(grid, cx - 1, eyeY, p.dark);
    setPixel(grid, cx + 1, eyeY, p.dark);
    setPixel(grid, cx + 2, eyeY, "#ffffff");
  } else if (eyeType === 3) {
    for (let dx = -2; dx <= 2; dx++) setPixel(grid, cx + dx, eyeY, p.glow);
  } else {
    setPixel(grid, cx - 2, eyeY - 1, p.dark);
    setPixel(grid, cx - 2, eyeY, p.accent);
    setPixel(grid, cx + 2, eyeY - 1, p.dark);
    setPixel(grid, cx + 2, eyeY, p.accent);
  }

  // Mouth
  const mouthType = seed.colorSeed % 3;
  if (mouthType === 0) {
    setPixel(grid, cx, 11, p.dark);
  } else if (mouthType === 1) {
    setPixel(grid, cx - 1, 11, p.dark);
    setPixel(grid, cx, 11, p.accent);
    setPixel(grid, cx + 1, 11, p.dark);
  }

  // ===== HAIR / HELMET =====
  const hairType = (seed.headType + seed.colorSeed) % 6;
  if (role === "future") {
    if (hairType % 2 === 0) {
      for (let dx = -headWidth; dx <= headWidth; dx++) {
        setPixel(grid, cx + dx, headTop - 1, p.secondary);
        setPixel(grid, cx + dx, headTop, p.secondary);
      }
      setPixel(grid, cx, headTop - 2, p.glow);
      setPixel(grid, cx, headTop - 3, p.glow);
      setPixel(grid, cx - 1, headTop - 3, p.highlight);
      setPixel(grid, cx + 1, headTop - 3, p.highlight);
    } else {
      for (let i = 0; i < 5; i++) setPixel(grid, cx, headTop - 1 - i, p.glow);
      setPixel(grid, cx - 1, headTop - 2, p.highlight);
      setPixel(grid, cx + 1, headTop - 2, p.highlight);
    }
  } else if (role === "medieval") {
    if (hairType < 2) {
      for (let dx = -headWidth; dx <= headWidth; dx++) setPixel(grid, cx + dx, headTop - 1, p.accent);
      setPixel(grid, cx - 2, headTop - 2, p.accent);
      setPixel(grid, cx, headTop - 2, p.accent);
      setPixel(grid, cx + 2, headTop - 2, p.accent);
      setPixel(grid, cx, headTop - 3, p.highlight);
    } else if (hairType < 4) {
      for (let dx = -(headWidth + 1); dx <= headWidth + 1; dx++) setPixel(grid, cx + dx, headTop - 1, p.secondary);
      setPixel(grid, cx - headWidth - 1, headTop, p.secondary);
      setPixel(grid, cx + headWidth + 1, headTop, p.secondary);
      setPixel(grid, cx - headWidth - 1, headTop + 1, p.secondary);
      setPixel(grid, cx + headWidth + 1, headTop + 1, p.secondary);
    } else {
      for (let dx = -headWidth; dx <= headWidth; dx++) setPixel(grid, cx + dx, headTop - 1, p.dark);
      setPixel(grid, cx - headWidth, headTop - 2, p.dark);
      setPixel(grid, cx - headWidth - 1, headTop - 3, p.dark);
      setPixel(grid, cx + headWidth, headTop - 2, p.dark);
      setPixel(grid, cx + headWidth + 1, headTop - 3, p.dark);
    }
  } else {
    if (hairType < 2) {
      for (let dx = -headWidth; dx <= headWidth; dx++) {
        setPixel(grid, cx + dx, headTop - 1, p.dark);
        setPixel(grid, cx + dx, headTop, p.dark);
      }
    } else if (hairType < 4) {
      for (let dx = -headWidth; dx <= headWidth; dx++) setPixel(grid, cx + dx, headTop - 1, p.dark);
      setPixel(grid, cx - 2, headTop - 2, p.dark);
      setPixel(grid, cx, headTop - 2, p.dark);
      setPixel(grid, cx + 2, headTop - 2, p.dark);
      setPixel(grid, cx - 1, headTop - 3, p.dark);
      setPixel(grid, cx + 1, headTop - 3, p.dark);
    } else {
      for (let dx = -(headWidth + 1); dx <= headWidth + 1; dx++) setPixel(grid, cx + dx, headTop - 1, p.primary);
      for (let dx = -headWidth; dx <= headWidth; dx++) setPixel(grid, cx + dx, headTop - 2, p.primary);
      setPixel(grid, cx + headWidth + 1, headTop - 1, p.accent);
      setPixel(grid, cx + headWidth + 2, headTop - 1, p.accent);
    }
  }

  // ===== WEAPON =====
  const wx = cx + shoulderWidth + 2;
  const wy = 12;
  const weaponType = seed.weaponType % 8;

  if (role === "future") {
    if (weaponType < 3) {
      for (let i = 0; i < 6; i++) setPixel(grid, wx, wy + i, p.secondary);
      setPixel(grid, wx + 1, wy, p.glow);
      setPixel(grid, wx + 1, wy + 1, p.glow);
      setPixel(grid, wx - 1, wy + 3, p.primary);
      setPixel(grid, wx + 1, wy + 3, p.primary);
      setPixel(grid, wx, wy - 1, p.glow);
      setPixel(grid, wx, wy - 2, p.highlight);
    } else if (weaponType < 5) {
      for (let i = 0; i < 8; i++) setPixel(grid, wx, wy + i - 3, i < 4 ? p.glow : p.secondary);
      setPixel(grid, wx - 1, wy - 3, p.highlight);
      setPixel(grid, wx + 1, wy - 3, p.highlight);
      setPixel(grid, wx, wy - 4, p.highlight);
    } else {
      setPixel(grid, wx, wy - 2, p.glow);
      setPixel(grid, wx - 1, wy - 1, p.secondary);
      setPixel(grid, wx, wy - 1, p.secondary);
      setPixel(grid, wx + 1, wy - 1, p.secondary);
      setPixel(grid, wx - 1, wy, p.primary);
      setPixel(grid, wx, wy, p.glow);
      setPixel(grid, wx + 1, wy, p.primary);
      setPixel(grid, wx - 2, wy, p.highlight);
      setPixel(grid, wx + 2, wy, p.highlight);
    }
  } else if (role === "medieval") {
    if (weaponType < 2) {
      for (let i = -5; i <= 5; i++) setPixel(grid, wx, wy + i, i < 0 ? p.highlight : p.secondary);
      setPixel(grid, wx - 1, wy, p.accent);
      setPixel(grid, wx + 1, wy, p.accent);
      setPixel(grid, wx, wy - 6, p.accent);
    } else if (weaponType < 4) {
      for (let i = -4; i <= 6; i++) setPixel(grid, wx, wy + i, p.secondary);
      setPixel(grid, wx - 1, wy - 4, p.glow);
      setPixel(grid, wx, wy - 5, p.glow);
      setPixel(grid, wx + 1, wy - 4, p.glow);
      setPixel(grid, wx, wy - 4, p.highlight);
    } else if (weaponType < 6) {
      for (let i = -3; i <= 5; i++) setPixel(grid, wx, wy + i, p.secondary);
      setPixel(grid, wx - 1, wy - 3, p.highlight);
      setPixel(grid, wx - 2, wy - 2, p.highlight);
      setPixel(grid, wx - 2, wy - 1, p.highlight);
      setPixel(grid, wx - 1, wy - 2, p.highlight);
      setPixel(grid, wx - 1, wy - 1, p.highlight);
    } else {
      const sx = cx - shoulderWidth - 2;
      for (let dy = -1; dy <= 3; dy++) {
        for (let ddx = -1; ddx <= 1; ddx++) setPixel(grid, sx + ddx, wy + dy + 3, p.accent);
      }
      setPixel(grid, sx, wy + 4, p.highlight);
      for (let i = -2; i <= 3; i++) setPixel(grid, wx, wy + i, p.highlight);
      setPixel(grid, wx - 1, wy, p.accent);
      setPixel(grid, wx + 1, wy, p.accent);
    }
  } else {
    if (weaponType < 2) {
      for (let dy = 0; dy < 3; dy++) {
        for (let ddx = -1; ddx <= 1; ddx++) setPixel(grid, wx + ddx, wy + dy + 4, p.secondary);
      }
      setPixel(grid, wx, wy + 4, p.glow);
      for (let ddx = -1; ddx <= 1; ddx++) setPixel(grid, wx + ddx, wy + 3, p.primary);
    } else if (weaponType < 4) {
      for (let i = 0; i < 7; i++) setPixel(grid, wx, wy + i, i < 2 ? p.highlight : p.secondary);
      setPixel(grid, wx - 1, wy + 2, p.primary);
      setPixel(grid, wx + 1, wy + 2, p.primary);
    } else if (weaponType < 6) {
      for (let dy = 0; dy < 3; dy++) {
        for (let ddx = -1; ddx <= 1; ddx++) setPixel(grid, wx + ddx, wy + 4 + dy, p.dark);
      }
      setPixel(grid, wx, wy + 3, p.dark);
      setPixel(grid, wx, wy + 4, p.accent);
    } else {
      for (let dy = 0; dy < 4; dy++) {
        for (let ddx = -1; ddx <= 1; ddx++) setPixel(grid, wx + ddx, wy + dy, p.glow);
      }
      setPixel(grid, wx - 2, wy + 1, p.highlight);
      setPixel(grid, wx + 2, wy + 1, p.highlight);
      setPixel(grid, wx - 2, wy + 2, p.highlight);
      setPixel(grid, wx + 2, wy + 2, p.highlight);
    }
  }

  // ===== AURA =====
  const auraType = seed.auraType % 5;
  if (auraType === 1) {
    for (let i = 0; i < 6; i++) {
      const px = cx + Math.round((rand(i) - 0.5) * 20);
      const py = Math.round(rand(i + 10) * 8) + 1;
      setPixel(grid, px, py, p.glow);
    }
  } else if (auraType === 2) {
    for (let i = 0; i < 4; i++) {
      const y = 10 + i * 4;
      setPixel(grid, cx - 8, y, p.glow);
      setPixel(grid, cx - 9, y, p.highlight);
      setPixel(grid, cx + 8, y, p.glow);
      setPixel(grid, cx + 9, y, p.highlight);
    }
  } else if (auraType === 3) {
    for (let dx = -4; dx <= 4; dx++) {
      setPixel(grid, cx + dx, 29, p.glow);
      if (Math.abs(dx) <= 2) setPixel(grid, cx + dx, 30, p.highlight);
    }
  } else if (auraType === 4) {
    for (let dx = -2; dx <= 2; dx++) setPixel(grid, cx + dx, headTop - 4, p.highlight);
    setPixel(grid, cx - 3, headTop - 3, p.highlight);
    setPixel(grid, cx + 3, headTop - 3, p.highlight);
  }

  // ===== CAPE / BACK DETAIL =====
  if (role === "medieval" && seed.auraType % 3 === 0) {
    const capeX = cx - shoulderWidth;
    for (let y = 15; y <= 25; y++) {
      const w = y < 20 ? 0 : y < 23 ? 1 : 2;
      for (let dx = 0; dx <= w; dx++) setPixel(grid, capeX - dx, y, p.accent);
    }
  }

  if (role === "future" && seed.auraType % 3 === 1) {
    const jpx = cx - shoulderWidth - 1;
    for (let y = 16; y <= 20; y++) {
      setPixel(grid, jpx, y, p.secondary);
      setPixel(grid, jpx - 1, y, p.secondary);
    }
    setPixel(grid, jpx, 21, p.glow);
    setPixel(grid, jpx - 1, 21, p.glow);
    setPixel(grid, jpx, 22, p.highlight);
  }

  // ===== UNIQUE MARKS =====
  if (rand(42) > 0.7) {
    setPixel(grid, cx + 1, 10, p.accent);
    setPixel(grid, cx + 2, 11, p.accent);
  }
  if (rand(77) > 0.8) {
    setPixel(grid, cx + shoulderWidth, 14, p.glow);
  }

  return grid;
}
