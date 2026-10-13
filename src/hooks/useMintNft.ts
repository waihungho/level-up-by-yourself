"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Transaction } from "@solana/web3.js";
import bs58 from "bs58";
import { useUnifiedWallet } from "@/hooks/useUnifiedWallet";
import { canMint, type MintPhase, type NftMint } from "@/lib/nft/eligibility";
import { buildMintAuthMessage } from "@/lib/nft/mint-auth";
import { getNftMint } from "@/lib/nft/nft-read";

/**
 * Client half of an agent NFT mint: ask the server for a transaction, have the wallet sign and
 * send it, then tell /api/nft/confirm about it. It never decides a mint succeeded — the server
 * settles that against the chain.
 */

const MAX_CONFIRM_ATTEMPTS = 10;
const CONFIRM_RETRY_MS = 3_000;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** POSTs JSON without retrying (a retried prepare would reserve again); a bad body reads as {}. */
async function postNft(path: string, body: Record<string, string>): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { ok: res.ok, status: res.status, data: await res.json().catch(() => ({})) };
}

export interface MintNftState {
  mint: NftMint | null;
  loaded: boolean;
  phase: MintPhase;
  error: string | null;
  /** Non-null when minting is unavailable; shown to the player. */
  blockedReason: string | null;
  start: () => Promise<void>;
}

export function useMintNft(agentId: string, confirmRetryMs = CONFIRM_RETRY_MS): MintNftState {
  const { publicKey, connection, sendTransaction, signMessage } = useUnifiedWallet();
  const [mint, setMint] = useState<NftMint | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [phase, setPhase] = useState<MintPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const inFlight = useRef(false);
  const wallet = publicKey?.toBase58() ?? null;

  const refresh = useCallback(async () => {
    const m = await getNftMint(agentId).catch(() => null);
    setMint(m);
    setNow(Date.now());
    setLoaded(true);
    return m;
  }, [agentId]);

  // Load, then reconcile a pending row once: the tab that broadcast it may have died before confirming.
  useEffect(() => {
    let cancelled = false;
    refresh().then(async (m) => {
      if (cancelled || !wallet || m?.status !== "pending") return;
      const res = await postNft("/api/nft/confirm", { assetAddress: m.assetAddress, wallet }).catch(() => null);
      if (!cancelled && res?.status === 200) await refresh();
    });
    return () => {
      cancelled = true;
    };
  }, [refresh, wallet]);

  // A pending reservation expires by time, not by event; tick so the button unblocks itself.
  useEffect(() => {
    if (mint?.status !== "pending") return;
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, [mint?.status]);

  const eligibility = canMint(mint, now);
  const blockedReason = !wallet ? "Connect your wallet to mint." : eligibility.ok ? null : eligibility.message;

  const fail = useCallback(
    (message: string) => {
      setPhase("error");
      setError(message);
      // prepare reserves before handing back a transaction, so a wallet rejection leaves a live
      // pending row; re-read it so the button reflects that instead of 409-ing on retry.
      void refresh();
    },
    [refresh]
  );

  /** Phase 2: the tx is broadcast; ask the server to verify it until it's visible on chain. */
  const pollConfirm = useCallback(
    async (assetAddress: string, payer: string, signature: string) => {
      setPhase("confirming");
      for (let attempt = 1; attempt <= MAX_CONFIRM_ATTEMPTS; attempt++) {
        const res = await postNft("/api/nft/confirm", { assetAddress, wallet: payer, signature }).catch(() => null);
        // Exactly 200: 202 ("not visible yet") also counts as res.ok.
        if (res?.status === 200) {
          setPhase("done");
          await refresh();
          return;
        }
        // Only 202 (not visible yet) or a network blip is worth asking again about.
        if (res && res.status !== 202) {
          fail((res.data.error as string) ?? "The mint could not be confirmed.");
          return;
        }
        if (attempt < MAX_CONFIRM_ATTEMPTS) await sleep(confirmRetryMs);
      }
      setPhase("unconfirmed");
      setError(`Your NFT is still confirming. It is not lost — reopen this page in a moment. Transaction: ${signature}`);
      void refresh();
    },
    [confirmRetryMs, fail, refresh]
  );

  const start = useCallback(async () => {
    if (!wallet || blockedReason || inFlight.current) return;
    inFlight.current = true;
    setError(null);
    let assetAddress: string;
    let signature: string;
    // Phase 1: prepare, sign and broadcast. The in-flight guard only needs to cover this part;
    // during confirmation the button is disabled by the busy phase.
    try {
      setPhase("preparing");
      // A signed authorization (desktop wallets) earns the normal rate limit; the mobile bridge
      // can't sign messages, so it gets the stricter unsigned one. Never fabricated.
      const auth: Record<string, string> = {};
      if (signMessage) {
        const message = buildMintAuthMessage(agentId, new Date().toISOString());
        auth.signedMessage = message;
        auth.signature = bs58.encode(await signMessage(new TextEncoder().encode(message)));
      }
      const prep = await postNft("/api/nft/prepare", { wallet, agentId, ...auth });
      if (!prep.ok) {
        fail((prep.data.error as string) ?? "Could not start the mint.");
        return;
      }
      assetAddress = prep.data.assetAddress as string;

      setPhase("signing");
      try {
        const tx = Transaction.from(Buffer.from(prep.data.transaction as string, "base64"));
        // sendTransaction (not signTransaction): the mobile bridge only supports sign-and-send,
        // and both paths preserve the server's partial signatures.
        signature = await sendTransaction(tx, connection);
      } catch (e) {
        const message = e instanceof Error ? e.message : "The mint failed.";
        fail(`${message} If your wallet approved it, the NFT will appear here shortly.`);
        return;
      }
    } catch (e) {
      fail(e instanceof Error ? e.message : "Could not start the mint.");
      return;
    } finally {
      inFlight.current = false;
    }
    await pollConfirm(assetAddress, wallet, signature);
  }, [wallet, blockedReason, signMessage, agentId, connection, sendTransaction, fail, pollConfirm]);

  return { mint, loaded, phase, error, blockedReason, start };
}
