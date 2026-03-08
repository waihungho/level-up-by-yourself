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

function hsl(h: number, s: number, l: number): string {
  h = ((h % 360) + 360) % 360;
  s /= 100;
  l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0,
    g = 0,
    b = 0;
  if (h < 60) {
    r = c;
    g = x;
  } else if (h < 120) {
    r = x;
    g = c;
  } else if (h < 180) {
    g = c;
    b = x;
  } else if (h < 240) {
    g = x;
    b = c;
  } else if (h < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }
  const toHex = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function getRolePalette(role: RoleCategory, colorSeed: number) {
  const shift = (colorSeed % 30) - 15;
  switch (role) {
    case "future":
      return {
        primary: hsl(180 + shift, 80, 60),
        secondary: hsl(270 + shift, 70, 55),
        accent: hsl(120 + shift, 80, 50),
        skin: hsl(180 + shift, 30, 75),
        dark: hsl(240 + shift, 40, 25),
      };
    case "modern":
      return {
        primary: hsl(210 + shift, 40, 55),
        secondary: hsl(0, 0, 70),
        accent: hsl(210 + shift, 60, 45),
        skin: hsl(30 + shift, 30, 70),
        dark: hsl(210 + shift, 20, 30),
      };
    case "medieval":
      return {
        primary: hsl(35 + shift, 70, 50),
        secondary: hsl(20 + shift, 60, 35),
        accent: hsl(0 + shift, 60, 45),
        skin: hsl(30 + shift, 40, 65),
        dark: hsl(25 + shift, 40, 20),
      };
  }
}

export function generateSpriteData(
  seed: SpriteSeed,
  role: RoleCategory,
): PixelGrid {
  const grid = createGrid();
  const palette = getRolePalette(role, seed.colorSeed);
  const cx = 15;

  // --- BODY (thin stick figure) ---
  const bodyVariants = [
    // Type 0: straight spine
    [
      [0, 0], [0, 1], [0, 2], [0, 3], [0, 4],
      [0, 5], [0, 6], [0, 7], [0, 8], [0, 9],
    ],
    // Type 1: slightly wider torso
    [
      [0, 0], [0, 1], [-1, 2], [1, 2], [0, 3],
      [-1, 4], [1, 4], [0, 5], [0, 6], [0, 7], [0, 8], [0, 9],
    ],
    // Type 2: hourglass
    [
      [-1, 0], [1, 0], [0, 1], [0, 2], [0, 3],
      [-1, 4], [1, 4], [-1, 5], [1, 5], [0, 6], [0, 7], [0, 8], [0, 9],
    ],
    // Type 3: broad shoulders
    [
      [-2, 0], [-1, 0], [0, 0], [1, 0], [2, 0],
      [0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [0, 6], [0, 7], [0, 8], [0, 9],
    ],
    // Type 4: thin with ribs
    [
      [0, 0], [0, 1], [-1, 2], [1, 2], [0, 3],
      [-1, 4], [1, 4], [0, 5], [0, 6], [0, 7], [0, 8], [0, 9],
    ],
  ];
  const bodyPixels = bodyVariants[seed.bodyType % bodyVariants.length];
  for (const [dx, dy] of bodyPixels) {
    setPixel(grid, cx + dx, 14 + dy, palette.primary);
  }

  // Arms (from y=15, extending left and right)
  const armY = 15;
  for (let i = 1; i <= 4; i++) {
    setPixel(grid, cx - i, armY + (i > 2 ? 1 : 0), palette.primary);
    setPixel(grid, cx + i, armY + (i > 2 ? 1 : 0), palette.primary);
  }

  // Legs (from bottom of spine, y=24)
  const legBase = 23;
  for (let i = 1; i <= 4; i++) {
    setPixel(grid, cx - 1, legBase + i, palette.primary);
    setPixel(grid, cx + 1, legBase + i, palette.primary);
  }
  // Feet
  setPixel(grid, cx - 2, legBase + 4, palette.dark);
  setPixel(grid, cx + 2, legBase + 4, palette.dark);

  // --- HEAD ---
  const headVariants = [
    // Type 0: round
    [
      [0, -2], [-1, -1], [0, -1], [1, -1],
      [-2, 0], [-1, 0], [0, 0], [1, 0], [2, 0],
      [-1, 1], [0, 1], [1, 1], [0, 2],
    ],
    // Type 1: square
    [
      [-2, -2], [-1, -2], [0, -2], [1, -2], [2, -2],
      [-2, -1], [-1, -1], [0, -1], [1, -1], [2, -1],
      [-2, 0], [-1, 0], [0, 0], [1, 0], [2, 0],
      [-2, 1], [-1, 1], [0, 1], [1, 1], [2, 1],
      [-2, 2], [-1, 2], [0, 2], [1, 2], [2, 2],
    ],
    // Type 2: tall
    [
      [-1, -3], [0, -3], [1, -3],
      [-1, -2], [0, -2], [1, -2],
      [-1, -1], [0, -1], [1, -1],
      [-1, 0], [0, 0], [1, 0],
      [-1, 1], [0, 1], [1, 1],
      [-1, 2], [0, 2], [1, 2],
    ],
    // Type 3: wide
    [
      [-3, -1], [-2, -1], [-1, -1], [0, -1], [1, -1], [2, -1], [3, -1],
      [-3, 0], [-2, 0], [-1, 0], [0, 0], [1, 0], [2, 0], [3, 0],
      [-3, 1], [-2, 1], [-1, 1], [0, 1], [1, 1], [2, 1], [3, 1],
    ],
    // Type 4: diamond
    [
      [0, -2], [-1, -1], [0, -1], [1, -1],
      [-2, 0], [-1, 0], [0, 0], [1, 0], [2, 0],
      [-1, 1], [0, 1], [1, 1], [0, 2],
    ],
    // Type 5: triangular (wider at bottom)
    [
      [0, -2], [-1, -1], [0, -1], [1, -1],
      [-2, 0], [-1, 0], [0, 0], [1, 0], [2, 0],
      [-3, 1], [-2, 1], [-1, 1], [0, 1], [1, 1], [2, 1], [3, 1],
    ],
  ];
  const headCenter = 10;
  const headPixels = headVariants[seed.headType % headVariants.length];
  for (const [dx, dy] of headPixels) {
    setPixel(grid, cx + dx, headCenter + dy, palette.skin);
  }

  // --- EYES ---
  const eyeVariants = [
    // Type 0: dot eyes
    [[-1, 0], [1, 0]],
    // Type 1: line eyes
    [[-2, 0], [-1, 0], [1, 0], [2, 0]],
    // Type 2: X eyes
    [
      [-2, -1], [0, -1], [2, -1],
      [-1, 0], [1, 0],
      [-2, 1], [0, 1], [2, 1],
    ],
    // Type 3: hollow eyes
    [
      [-2, -1], [-1, -1], [0, -1], [-2, 0], [0, 0], [-2, 1], [-1, 1], [0, 1],
      [1, -1], [2, -1], [3, -1], [1, 0], [3, 0], [1, 1], [2, 1], [3, 1],
    ],
  ];
  const eyePixels = eyeVariants[seed.eyeType % eyeVariants.length];
  for (const [dx, dy] of eyePixels) {
    setPixel(grid, cx + dx, headCenter + dy, palette.dark);
  }

  // --- WEAPON/TOOL ---
  const weaponX = cx + 5;
  const weaponY = 16;
  const weaponVariants = [
    // Type 0: staff
    [[0, -4], [0, -3], [0, -2], [0, -1], [0, 0], [0, 1], [0, 2], [0, 3]],
    // Type 1: sword
    [[0, -4], [0, -3], [0, -2], [0, -1], [0, 0], [-1, 1], [0, 1], [1, 1], [0, 2]],
    // Type 2: orb
    [[0, -3], [-1, -2], [0, -2], [1, -2], [-1, -1], [0, -1], [1, -1], [0, 0]],
    // Type 3: wrench
    [[0, -3], [-1, -2], [1, -2], [0, -1], [0, 0], [0, 1], [0, 2], [-1, 3], [1, 3]],
    // Type 4: circuit board
    [[0, -2], [1, -2], [2, -2], [0, -1], [0, 0], [1, 0], [2, 0], [2, 1], [2, 2], [1, 2], [0, 2]],
    // Type 5: axe
    [[0, -3], [0, -2], [0, -1], [0, 0], [-1, -3], [-2, -3], [-1, -2], [-2, -2], [0, 1], [0, 2]],
    // Type 6: book
    [[-1, -2], [0, -2], [1, -2], [-1, -1], [0, -1], [1, -1], [-1, 0], [0, 0], [1, 0], [-1, 1], [0, 1], [1, 1]],
    // Type 7: wand with sparkle
    [[0, -4], [0, -3], [0, -2], [0, -1], [0, 0], [-1, -4], [1, -4], [-1, -5], [1, -5]],
  ];
  const weaponPixels = weaponVariants[seed.weaponType % weaponVariants.length];
  for (const [dx, dy] of weaponPixels) {
    setPixel(grid, weaponX + dx, weaponY + dy, palette.accent);
  }

  // --- AURA ---
  const auraVariants: number[][][] = [
    [], // Type 0: no aura
    // Type 1: corner dots
    [[cx - 5, 6], [cx + 5, 6], [cx - 5, 26], [cx + 5, 26]],
    // Type 2: floating particles above head
    [[cx - 3, 5], [cx + 3, 5], [cx, 4], [cx - 1, 3], [cx + 1, 3]],
    // Type 3: side lines
    [[cx - 6, 12], [cx - 6, 14], [cx - 6, 16], [cx + 6, 12], [cx + 6, 14], [cx + 6, 16]],
    // Type 4: bottom glow
    [
      [cx - 2, 28], [cx - 1, 28], [cx, 28], [cx + 1, 28], [cx + 2, 28],
      [cx - 1, 29], [cx, 29], [cx + 1, 29],
    ],
  ];
  const auraPixels = auraVariants[seed.auraType % auraVariants.length];
  for (const pos of auraPixels) {
    setPixel(grid, pos[0], pos[1], palette.secondary);
  }

  return grid;
}
