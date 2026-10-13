/**
 * The JSON a minted agent carries on chain, and the snapshot stored alongside the mint row.
 * Pure: the route does the I/O. Everything here is frozen into immutable metadata, so the
 * trait names are permanent once the first agent is minted.
 */
import { DIMENSIONS } from "@/lib/constants";
import type { AgentWithDimensions, DimensionCategory, RoleCategory } from "@/lib/types";

export const NFT_SYMBOL = "LUBY";
export const NFT_COLLECTION_NAME = "Level Up By Yourself";
const DESCRIPTION_MAX = 500;

/** Where `external_url` points. An unset variable must still produce a URL that resolves. */
export const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://level-up-by-yourself.vercel.app";

export interface NftAttribute {
  trait_type: string;
  value: string | number;
}

export interface NftMetadata {
  name: string;
  symbol: string;
  description: string;
  image: string;
  external_url: string;
  attributes: NftAttribute[];
  properties: { files: { uri: string; type: string }[]; category: "image" };
}

/** What was minted, kept because the agent keeps growing after the NFT is frozen. */
export interface MintSnapshot {
  name: string;
  role: RoleCategory;
  roleTitle: string;
  dimensions: Record<string, number>;
  categories: Record<DimensionCategory, number>;
  totalPower: number;
}

const ROLE_LABEL: Record<RoleCategory, string> = { future: "Future", modern: "Modern", medieval: "Medieval" };
const CATEGORIES: DimensionCategory[] = ["Physical", "Mental", "Social", "Spiritual", "Technical"];

export function buildSnapshot(agent: AgentWithDimensions): MintSnapshot {
  const byId = new Map(agent.dimensions.map((d) => [d.dimensionId, d.value]));
  const dimensions: Record<string, number> = {};
  const categories = Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as Record<DimensionCategory, number>;
  for (const dim of DIMENSIONS) {
    const value = Math.round(byId.get(dim.id) ?? 0);
    dimensions[dim.name] = value;
    categories[dim.category] += value;
  }
  const totalPower = CATEGORIES.reduce((sum, c) => sum + categories[c], 0);
  return { name: agent.name, role: agent.role, roleTitle: agent.roleTitle, dimensions, categories, totalPower };
}

function describe(agent: AgentWithDimensions): string {
  const text = `${agent.name} — ${agent.roleTitle}. ${agent.character} Objective: ${agent.objective}`.replace(/\s+/g, " ").trim();
  return text.length > DESCRIPTION_MAX ? `${text.slice(0, DESCRIPTION_MAX - 1)}…` : text;
}

export function buildNftMetadata(agent: AgentWithDimensions, imageUri: string, mintedAt: Date): NftMetadata {
  const snap = buildSnapshot(agent);
  const attributes: NftAttribute[] = [
    { trait_type: "Role", value: ROLE_LABEL[agent.role] ?? agent.role },
    { trait_type: "Role Title", value: agent.roleTitle },
    ...CATEGORIES.map((c) => ({ trait_type: c, value: snap.categories[c] })),
    { trait_type: "Total Power", value: snap.totalPower },
    ...DIMENSIONS.map((d) => ({ trait_type: d.name, value: snap.dimensions[d.name] })),
    { trait_type: "Minted", value: mintedAt.toISOString().slice(0, 10) },
  ];
  return {
    name: agent.name,
    symbol: NFT_SYMBOL,
    description: describe(agent),
    image: imageUri,
    external_url: `${SITE_URL}/agents/${agent.id}`,
    attributes,
    properties: { files: [{ uri: imageUri, type: "image/png" }], category: "image" },
  };
}
