"use client";
import { useId } from "react";
import { useMintNft } from "@/hooks/useMintNft";
import { isMintBusy, type MintPhase } from "@/lib/nft/eligibility";
import { NFT_MINT_COST_SOL } from "@/lib/constants";

const PHASE_LABEL: Partial<Record<MintPhase, string>> = {
  preparing: "Preparing your NFT…",
  signing: "Approve in your wallet…",
  confirming: "Confirming on chain…",
};

function solscanUrl(address: string): string {
  const network = process.env.NEXT_PUBLIC_SOLANA_NETWORK;
  const cluster = network && network !== "mainnet-beta" ? `?cluster=${network}` : "";
  return `https://solscan.io/token/${address}${cluster}`;
}

interface MintNftPanelProps {
  agentId: string;
  /** Delay between confirmation polls; overridable for tests. */
  confirmRetryMs?: number;
}

/** Mint an agent as an NFT. Rendered only for the agent's owner. */
export function MintNftPanel({ agentId, confirmRetryMs }: MintNftPanelProps) {
  const { mint, loaded, phase, error, blockedReason, start } = useMintNft(agentId, confirmRetryMs);
  const reasonId = useId();
  if (!loaded) return null;

  const busy = isMintBusy(phase);
  const minted = mint?.status === "confirmed";

  return (
    <div className="bg-gray-900 border border-gray-800 rounded p-4">
      <h2 className="text-lg font-mono font-bold mb-1">Agent NFT</h2>
      {minted ? (
        <p className="font-mono text-sm text-emerald-300">
          ✓ Minted on Solana.{" "}
          <a href={solscanUrl(mint.assetAddress)} target="_blank" rel="noopener noreferrer" className="underline text-purple-300 hover:text-purple-200">
            View on Solscan
          </a>
        </p>
      ) : (
        <>
          <p className="font-mono text-xs text-gray-400 mb-3">
            Freeze this agent&apos;s avatar and all 50 dimensions into a Solana NFT you own. One mint per agent; the agent keeps growing in game.
          </p>
          <button
            type="button"
            disabled={busy || !!blockedReason}
            aria-busy={busy}
            aria-describedby={blockedReason && !busy ? reasonId : undefined}
            onClick={start}
            className="w-full min-h-[44px] rounded bg-purple-700 hover:bg-purple-600 disabled:opacity-40 font-mono text-sm font-bold text-white"
          >
            {PHASE_LABEL[phase] ?? `Mint as NFT · ${NFT_MINT_COST_SOL} SOL`}
          </button>
          {blockedReason && !busy && <p id={reasonId} className="mt-2 font-mono text-xs text-gray-400">{blockedReason}</p>}
        </>
      )}
      {error && (
        <p role="status" className={`mt-2 font-mono text-xs break-all ${phase === "unconfirmed" ? "text-amber-300" : "text-red-300"}`}>
          {error}
        </p>
      )}
    </div>
  );
}
