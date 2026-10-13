/*
 * Purpose memos attached to server-verified SOL payments. The server requires the exact memo,
 * so a payment made for one thing (summon, donation, recharge, a gem pack) can't be redeemed
 * for another. Client-safe: no server imports.
 */

export function gemPackMemo(packId: string): string {
  return `levelup:gems:${packId}`;
}

export function rechargeMemo(agentId: string): string {
  return `levelup:recharge:${agentId}`;
}

export function nftMintMemo(agentId: string): string {
  return `levelup:nft:${agentId}`;
}
