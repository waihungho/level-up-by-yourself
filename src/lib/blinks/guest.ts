import { DIMENSIONS } from "@/lib/constants";
import type { AgentWithDimensions, RoleCategory } from "@/lib/types";

export const GUEST_STAT = 150;
const GUEST_ROLES: RoleCategory[] = ["future", "modern", "medieval"];

/** FNV-1a: a stable, well-spread hash of the wallet string. */
function hashWallet(wallet: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < wallet.length; i++) {
    h ^= wallet.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Stand-in fighter for wallets without agents: 150 in every stat, role chosen by the wallet hash. */
export function guestFighter(wallet: string): AgentWithDimensions {
  const hash = hashWallet(wallet);
  const id = `guest:${wallet}`;
  return {
    id,
    playerId: "",
    name: "Guest",
    role: GUEST_ROLES[hash % GUEST_ROLES.length],
    roleTitle: "Wanderer",
    character: "",
    objective: "",
    spriteSeed: { bodyType: hash % 4, headType: (hash >> 2) % 4, eyeType: (hash >> 4) % 4, weaponType: (hash >> 6) % 4, auraType: 0, colorSeed: hash % 1000 },
    createdAt: new Date(0).toISOString(),
    dimensions: DIMENSIONS.map((d) => ({ agentId: id, dimensionId: d.id, value: GUEST_STAT })),
  };
}
