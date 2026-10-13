/**
 * Renders an agent's pixel sprite as the NFT image: a 512×512 PNG, the 32×32 sprite scaled ×14
 * and centred on a role-coloured background. Server-only (node:zlib). Deterministic, so the same
 * agent always yields the same bytes.
 */
import { deflateSync } from "node:zlib";
import { generateSpriteData, type SpriteSeed } from "@/lib/sprite-renderer";
import type { RoleCategory } from "@/lib/types";

export const AVATAR_SIZE = 512;
const GRID = 32;
const SCALE = 14;
const OFFSET = (AVATAR_SIZE - GRID * SCALE) / 2;

/** Dark, role-tinted backgrounds that match the role borders on the agent page. */
export const ROLE_BACKGROUND: Record<RoleCategory, string> = {
  future: "#1e1033",
  modern: "#0c1a33",
  medieval: "#2a1a08",
};

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1, 7), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** Encodes RGB pixels (row-major, 3 bytes each) as a PNG with filter type 0 on every row. */
export function encodePng(width: number, height: number, rgb: Uint8Array): Buffer {
  const raw = Buffer.alloc(height * (width * 3 + 1));
  for (let y = 0; y < height; y++) {
    const row = y * (width * 3 + 1);
    raw[row] = 0;
    raw.set(rgb.subarray(y * width * 3, (y + 1) * width * 3), row + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

export function renderAvatarPng(spriteSeed: SpriteSeed, role: RoleCategory, weaponTint?: string): Buffer {
  const grid = generateSpriteData(spriteSeed, role, weaponTint);
  const rgb = new Uint8Array(AVATAR_SIZE * AVATAR_SIZE * 3);
  const background = hexToRgb(ROLE_BACKGROUND[role] ?? ROLE_BACKGROUND.modern);
  for (let i = 0; i < AVATAR_SIZE * AVATAR_SIZE; i++) rgb.set(background, i * 3);

  for (let gy = 0; gy < GRID; gy++) {
    for (let gx = 0; gx < GRID; gx++) {
      const color = grid[gy][gx];
      if (!color) continue;
      const px = hexToRgb(color);
      for (let dy = 0; dy < SCALE; dy++) {
        const rowStart = ((OFFSET + gy * SCALE + dy) * AVATAR_SIZE + OFFSET + gx * SCALE) * 3;
        for (let dx = 0; dx < SCALE; dx++) rgb.set(px, rowStart + dx * 3);
      }
    }
  }
  return encodePng(AVATAR_SIZE, AVATAR_SIZE, rgb);
}
