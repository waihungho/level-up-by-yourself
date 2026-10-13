import { describe, it, expect } from "vitest";
import { inflateSync } from "node:zlib";
import { canMint, MINT_RESERVATION_TTL_MS, type NftMint } from "../eligibility";
import { buildNftMetadata, buildSnapshot, NFT_SYMBOL } from "../metadata";
import { renderAvatarPng, AVATAR_SIZE, ROLE_BACKGROUND } from "../render-avatar";
import { verifyMint } from "../verify-mint";
import { DIMENSIONS } from "@/lib/constants";
import { generateSpriteData } from "@/lib/sprite-renderer";
import type { AgentWithDimensions } from "@/lib/types";

const seed = { bodyType: 1, headType: 2, eyeType: 0, weaponType: 3, auraType: 1, colorSeed: 77 };

const agent: AgentWithDimensions = {
  id: "agent-1",
  playerId: "player-1",
  name: "Aria-7",
  role: "future",
  roleTitle: "Quantum Ranger",
  character: "Calm  and\nprecise.",
  objective: "Map the void.",
  spriteSeed: seed,
  createdAt: "2026-10-01T00:00:00Z",
  // value = id, so category sums are easy to check: Physical = 1..10 = 55.
  dimensions: DIMENSIONS.map((d) => ({ agentId: "agent-1", dimensionId: d.id, value: d.id })),
};

describe("canMint", () => {
  const now = Date.parse("2026-10-13T12:00:00Z");
  const row = (status: NftMint["status"], ageMs: number): NftMint => ({
    agentId: "a", assetAddress: "x", status, createdAt: new Date(now - ageMs).toISOString(), txSignature: null,
  });
  it("allows an agent with no mint", () => expect(canMint(null, now).ok).toBe(true));
  it("blocks a confirmed mint", () => expect(canMint(row("confirmed", 1e9), now)).toMatchObject({ ok: false, reason: "already_minted" }));
  it("blocks a live pending mint, including exactly at the TTL", () => {
    expect(canMint(row("pending", 1000), now)).toMatchObject({ ok: false, reason: "mint_pending" });
    expect(canMint(row("pending", MINT_RESERVATION_TTL_MS), now)).toMatchObject({ ok: false });
  });
  it("allows once a pending reservation has expired", () => {
    expect(canMint(row("pending", MINT_RESERVATION_TTL_MS + 1), now).ok).toBe(true);
  });
});

describe("buildNftMetadata", () => {
  const meta = buildNftMetadata(agent, "https://arweave.net/img", new Date("2026-10-13T08:00:00Z"));
  const trait = (t: string) => meta.attributes.find((a) => a.trait_type === t)?.value;

  it("carries every dimension as a numeric trait", () => {
    for (const d of DIMENSIONS) expect(trait(d.name)).toBe(d.id);
    expect(meta.attributes).toHaveLength(2 + 5 + 1 + DIMENSIONS.length + 1);
  });
  it("sums category totals and total power", () => {
    expect(trait("Physical")).toBe(55);
    expect(trait("Technical")).toBe(455); // 41..50
    expect(trait("Total Power")).toBe(1275); // 1..50
  });
  it("labels role, symbol, image and mint date", () => {
    expect(trait("Role")).toBe("Future");
    expect(trait("Role Title")).toBe("Quantum Ranger");
    expect(trait("Minted")).toBe("2026-10-13");
    expect(meta.symbol).toBe(NFT_SYMBOL);
    expect(meta.image).toBe("https://arweave.net/img");
    expect(meta.properties.files).toEqual([{ uri: "https://arweave.net/img", type: "image/png" }]);
    expect(meta.external_url).toMatch(/\/agents\/agent-1$/);
  });
  it("collapses whitespace and caps the description at 500 chars", () => {
    expect(meta.description).toBe("Aria-7 — Quantum Ranger. Calm and precise. Objective: Map the void.");
    const long = buildNftMetadata({ ...agent, character: "x".repeat(900) }, "u", new Date());
    expect(long.description).toHaveLength(500);
    expect(long.description.endsWith("…")).toBe(true);
  });
  it("treats missing dimensions as 0 in the snapshot", () => {
    const snap = buildSnapshot({ ...agent, dimensions: [] });
    expect(snap.totalPower).toBe(0);
    expect(snap.dimensions.Strength).toBe(0);
  });
});

function decodePng(png: Buffer) {
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  // Concatenate all IDAT chunks.
  const idat: Buffer[] = [];
  for (let off = 8; off < png.length; ) {
    const len = png.readUInt32BE(off);
    const type = png.toString("ascii", off + 4, off + 8);
    if (type === "IDAT") idat.push(png.subarray(off + 8, off + 8 + len));
    off += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const px = (x: number, y: number) => {
    const i = y * (width * 3 + 1) + 1 + x * 3;
    return `#${[raw[i], raw[i + 1], raw[i + 2]].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
  };
  return { width, height, px, raw };
}

describe("renderAvatarPng", () => {
  const png = renderAvatarPng(seed, "future", "#facc15");

  it("is a 512×512 RGB PNG", () => {
    expect(png.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    const { width, height, raw } = decodePng(png);
    expect([width, height]).toEqual([AVATAR_SIZE, AVATAR_SIZE]);
    expect(png[25]).toBe(2);
    expect(raw.length).toBe(AVATAR_SIZE * (AVATAR_SIZE * 3 + 1));
  });
  it("paints the role background and the sprite's pixels at ×14 scale", () => {
    const { px } = decodePng(png);
    expect(px(0, 0)).toBe(ROLE_BACKGROUND.future);
    const grid = generateSpriteData(seed, "future", "#facc15");
    let checked = 0;
    for (let y = 0; y < 32; y++) {
      for (let x = 0; x < 32; x++) {
        const c = grid[y][x];
        const centre = px(32 + x * 14 + 7, 32 + y * 14 + 7);
        expect(centre).toBe(c ? c.toLowerCase() : ROLE_BACKGROUND.future);
        if (c) checked++;
      }
    }
    expect(checked).toBeGreaterThan(50);
  });
  it("is deterministic", () => {
    expect(renderAvatarPng(seed, "future", "#facc15").equals(png)).toBe(true);
    expect(renderAvatarPng(seed, "medieval").equals(png)).toBe(false);
  });
});

describe("verifyMint", () => {
  const payer = "Payer111111111111111111111111111111111111111";
  const treasury = "Treasury1111111111111111111111111111111111111";
  const asset = "Asset11111111111111111111111111111111111111";
  const opts = { payer, treasury, minLamports: 50_000_000, memo: "levelup:nft:agent-1", assetAddress: asset };

  function tx(over: { err?: unknown; lamports?: number; memo?: string; assetPre?: number; assetPost?: number; source?: string; noAsset?: boolean } = {}) {
    return {
      blockTime: 1_800_000_000,
      meta: {
        err: over.err ?? null,
        preBalances: [1e9, 0, over.assetPre ?? 0],
        postBalances: [9e8, 5e7, over.assetPost ?? 3_000_000],
      },
      transaction: {
        message: {
          accountKeys: [payer, treasury, over.noAsset ? "Other1111" : asset].map((pubkey) => ({ pubkey })),
          instructions: [
            { program: "system", parsed: { type: "transfer", info: { source: over.source ?? payer, destination: treasury, lamports: over.lamports ?? 50_000_000 } } },
            { program: "spl-memo", parsed: over.memo ?? opts.memo },
          ],
        },
      },
    };
  }

  it("accepts a paid transaction that created the asset", () => expect(verifyMint(tx(), opts)).toEqual({ ok: true }));
  it("reports a missing transaction as not_found", () => expect(verifyMint(null, opts)).toEqual({ ok: false, reason: "not_found" }));
  it("rejects failed, underpaid, wrong-payer or wrong-memo transactions", () => {
    for (const bad of [{ err: { x: 1 } }, { lamports: 49_999_999 }, { source: "Someone" }, { memo: "levelup:nft:other" }]) {
      expect(verifyMint(tx(bad), opts)).toEqual({ ok: false, reason: "payment_invalid" });
    }
  });
  it("rejects a transaction that did not create the asset", () => {
    for (const bad of [{ noAsset: true }, { assetPre: 100 }, { assetPost: 0 }]) {
      expect(verifyMint(tx(bad), opts)).toEqual({ ok: false, reason: "asset_missing" });
    }
  });
});
