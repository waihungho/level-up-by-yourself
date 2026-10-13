"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Transaction } from "@solana/web3.js";
import { useUnifiedWallet } from "@/hooks/useUnifiedWallet";
import { canMint, type MintPhase, type NftMint } from "@/lib/nft/eligibility";
import { getNftMint } from "@/lib/nft/nft-read";

/**
 * Client half of an agent NFT mint: ask the server for a transaction, have the wallet sign and
 * send it, then tell /api/nft/confirm about it. It never decides a mint succeeded — the server
 * settles that against the chain.
 */

const MAX_CONFIRM_ATTEMPTS = 10;
const CONFIRM_RETRY_MS = 3_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface MintNftState {
  mint: NftMint | null;
  loaded: boolean;
  phase: MintPhase;
  error: string | null;
  /** Non-null when minting is unavailable; shown to the player. */
  blockedReason: string | null;
  start: () => Promise<void>;
}

async function postConfirm(body: Record<string, string>): Promise<{ status: number; error?: string }> {
  const res = await fetch("/api/nft/confirm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, error: data.error };
}

export function useMintNft(agentId: string): MintNftState {
  const { publicKey, connection, sendTransaction } = useUnifiedWallet();
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
      const res = await postConfirm({ assetAddress: m.assetAddress, wallet }).catch(() => null);
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

  const start = useCallback(async () => {
    if (!wallet || !publicKey || blockedReason || inFlight.current) return;
    inFlight.current = true;
    setError(null);
    let assetAddress: string | null = null;
    let signature: string;
    try {
      setPhase("preparing");
      const prep = await fetch("/api/nft/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet, agentId }),
      });
      const prepBody = await prep.json().catch(() => ({}));
      if (!prep.ok) {
        fail(prepBody.error ?? "Could not start the mint.");
        return;
      }
      assetAddress = prepBody.assetAddress as string;

      setPhase("signing");
      const tx = Transaction.from(Buffer.from(prepBody.transaction as string, "base64"));
      // sendTransaction (not signTransaction): the mobile bridge only supports sign-and-send,
      // and both paths preserve the server's partial signatures.
      signature = await sendTransaction(tx, connection);
    } catch (e) {
      const message = e instanceof Error ? e.message : "The mint failed.";
      fail(assetAddress ? `${message} If your wallet approved it, the NFT will appear here shortly.` : message);
      return;
    } finally {
      inFlight.current = false;
    }

    setPhase("confirming");
    for (let attempt = 1; attempt <= MAX_CONFIRM_ATTEMPTS; attempt++) {
      const res = await postConfirm({ assetAddress: assetAddress!, wallet, signature }).catch(() => null);
      if (res?.status === 200) {
        setPhase("done");
        await refresh();
        return;
      }
      // Only 202 (not visible yet) or a network blip is worth asking again about.
      if (res && res.status !== 202) {
        fail(res.error ?? "The mint could not be confirmed.");
        return;
      }
      if (attempt < MAX_CONFIRM_ATTEMPTS) await sleep(CONFIRM_RETRY_MS);
    }
    setPhase("unconfirmed");
    setError(`Your NFT is still confirming. It is not lost — reopen this page in a moment. Transaction: ${signature}`);
    void refresh();
  }, [wallet, publicKey, blockedReason, agentId, connection, sendTransaction, fail, refresh]);

  return { mint, loaded, phase, error, blockedReason, start };
}
