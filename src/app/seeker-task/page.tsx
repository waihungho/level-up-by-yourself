"use client";

import { useState, useEffect, useCallback } from "react";
import { useUnifiedWallet } from "@/hooks/useUnifiedWallet";
import { useGame } from "@/components/GameProvider";
import { createPaymentTransaction, confirmTransaction } from "@/lib/sol-payment";
import { recordSeekerTask, getSeekerTaskCount } from "@/lib/db";
import { useTxProgress } from "@/hooks/useTxProgress";
import TransactionProgress from "@/components/TransactionProgress";

const TOTAL_TXS = 10;
const SOL_PER_TX = 0.0015;

export default function SeekerTaskPage() {
  const { publicKey, connected, sendTransaction, connection } = useUnifiedWallet();
  const { player } = useGame();
  const { txProgress, startTxProgress, updateTxStep, closeTxProgress } = useTxProgress();

  const [taskCount, setTaskCount] = useState(0);
  const [running, setRunning] = useState(false);
  const [completed, setCompleted] = useState(0);
  const [statusText, setStatusText] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!player) return;
    getSeekerTaskCount(player.id).then(setTaskCount).catch(() => {});
  }, [player]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 5000);
  };

  const handleLaunchMission = useCallback(async () => {
    if (!publicKey || !connected || !player) return;
    if (running) return;

    setRunning(true);
    setCompleted(0);
    setStatusText("Initializing mission...");

    const stepLabels = Array.from({ length: TOTAL_TXS }, (_, i) => `Transaction ${i + 1}`);
    startTxProgress(`Seeker Mission (${TOTAL_TXS} x ${SOL_PER_TX} SOL)`, stepLabels);

    let done = 0;

    for (let i = 0; i < TOTAL_TXS; i++) {
      updateTxStep(i, "active");
      setStatusText(`TX ${i + 1}/${TOTAL_TXS} — Building transaction...`);
      try {
        const tx = await createPaymentTransaction(connection, publicKey, SOL_PER_TX);
        setStatusText(`TX ${i + 1}/${TOTAL_TXS} — Waiting for wallet approval...`);
        let signature: string;
        try {
          signature = await sendTransaction(tx, connection);
        } catch (walletErr: unknown) {
          const em = walletErr instanceof Error ? walletErr.message : "";
          updateTxStep(i, "error", /reject|cancel|denied/i.test(em) ? "Cancelled" : em.slice(0, 40));
          setStatusText(`TX ${i + 1} — ${/reject|cancel|denied/i.test(em) ? "Cancelled by user" : "Failed"}`);
          showToast(
            /reject|cancel|denied/i.test(em)
              ? "Transaction cancelled"
              : `Transaction ${i + 1} failed: ${em.slice(0, 60)}`
          );
          break;
        }

        setStatusText(`TX ${i + 1}/${TOTAL_TXS} — Sent! Confirming on chain...`);
        updateTxStep(i, "active", signature.slice(0, 16) + "...");

        const confirmed = await confirmTransaction(connection, signature, (check, total) => {
          updateTxStep(i, "active", `Confirm ${check}/${total}`);
          setStatusText(`TX ${i + 1}/${TOTAL_TXS} — Confirming... (${check}/${total})`);
        });

        if (!confirmed) {
          updateTxStep(i, "error", "Not confirmed");
          setStatusText(`TX ${i + 1} — Not confirmed on chain`);
          showToast(`Transaction ${i + 1} not confirmed on chain`);
          break;
        }

        await recordSeekerTask(player.id, signature, SOL_PER_TX);
        done++;
        setCompleted(done);
        setTaskCount((prev) => prev + 1);
        updateTxStep(i, "done", "Confirmed");
        setStatusText(done < TOTAL_TXS ? `TX ${i + 1} confirmed! Moving to next...` : "All transactions confirmed!");
      } catch (err: unknown) {
        const em = err instanceof Error ? err.message : "Failed";
        updateTxStep(i, "error", em.slice(0, 40));
        setStatusText(`TX ${i + 1} — Failed`);
        showToast(`Transaction ${i + 1} failed`);
        break;
      }
    }

    if (done === TOTAL_TXS) {
      setStatusText("Mission Complete! All 10 transactions sent.");
      showToast("Mission Complete! All 10 transactions sent.");
    }

    closeTxProgress(done === TOTAL_TXS ? 5000 : 10000);
    setTimeout(() => { setRunning(false); setStatusText(""); }, done === TOTAL_TXS ? 5000 : 3000);
  }, [publicKey, connected, player, running, connection, sendTransaction, startTxProgress, updateTxStep, closeTxProgress]);

  if (!connected || !publicKey) {
    return (
      <main className="min-h-screen bg-gray-950 text-white p-6 pb-24 max-w-2xl mx-auto">
        <div className="text-center py-24">
          <p className="text-xs font-mono text-gray-600 tracking-wider">// WALLET REQUIRED</p>
          <p className="text-gray-500 mt-2 text-sm font-mono">Connect your wallet to start Seeker Tasks</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-950 text-white p-6 pb-24 max-w-2xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <p className="text-[10px] font-mono text-green-400/60 tracking-[0.2em] uppercase mb-1">
          On-Chain Missions
        </p>
        <h1 className="text-2xl font-bold font-mono">
          <span className="text-green-400">SEEKER</span>{" "}
          <span className="text-white">TASK</span>
        </h1>
      </div>

      {/* Stats */}
      <div className="bg-gray-900/50 border border-gray-800 rounded-lg px-4 py-3">
        <p className="text-[10px] font-mono text-gray-500 tracking-wider uppercase">Total Transactions</p>
        <p className="text-xl font-bold font-mono text-green-400 mt-1">{taskCount}</p>
      </div>

      {/* Mission Card */}
      <div className="bg-gray-900/50 border border-green-900/30 rounded-xl p-6 space-y-5">
        <div className="space-y-2">
          <h2 className="text-sm font-mono font-bold text-green-400 tracking-wider">SEEKER MISSION</h2>
          <p className="text-xs font-mono text-gray-400 leading-relaxed">
            Send {TOTAL_TXS} transactions of {SOL_PER_TX} SOL each to build your on-chain history.
            Every transaction counts on Solana Seeker!
          </p>
        </div>

        {/* Progress (during mission) */}
        {running && (
          <div className="space-y-3 bg-black/30 rounded-lg p-4 border border-green-900/20">
            <div className="flex justify-between text-[10px] font-mono">
              <span className="text-gray-500">PROGRESS</span>
              <span className="text-green-400 font-bold">{completed}/{TOTAL_TXS}</span>
            </div>
            <div className="w-full bg-gray-800 rounded-full h-3 overflow-hidden">
              <div
                className="bg-gradient-to-r from-green-600 to-green-400 h-full rounded-full transition-all duration-500"
                style={{ width: `${(completed / TOTAL_TXS) * 100}%` }}
              />
            </div>
            <p className="text-[11px] font-mono text-green-400/80 animate-pulse">
              {statusText}
            </p>
          </div>
        )}

        <button
          onClick={handleLaunchMission}
          disabled={running}
          className={`w-full py-3 rounded-lg text-sm font-mono font-bold tracking-wider transition-all border ${
            running
              ? "bg-green-900/20 text-green-400/50 border-green-800/30 cursor-not-allowed"
              : "bg-green-500/10 text-green-400 border-green-500/30 hover:bg-green-500/20 hover:border-green-500/50 active:scale-[0.98]"
          }`}
        >
          {running ? `MISSION IN PROGRESS... ${completed}/${TOTAL_TXS}` : "LAUNCH MISSION"}
        </button>

        <p className="text-[10px] font-mono text-gray-600 text-center">
          {TOTAL_TXS} transactions x {SOL_PER_TX} SOL = {(TOTAL_TXS * SOL_PER_TX).toFixed(3)} SOL total
        </p>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-20 left-5 z-[99999] bg-gray-950/95 border border-gray-700/50 rounded-lg px-4 py-2.5 font-mono text-xs text-gray-200 shadow-2xl">
          {toast}
        </div>
      )}

      {/* Transaction progress overlay */}
      {txProgress && <TransactionProgress state={txProgress} />}
    </main>
  );
}
