import { useState, useRef, useCallback } from "react";

export type TxStepStatus = "pending" | "active" | "done" | "error";

export interface TxStep {
  label: string;
  status: TxStepStatus;
  detail: string;
}

export interface TxProgressState {
  title: string;
  steps: TxStep[];
  startTime: number;
}

export function useTxProgress() {
  const [txProgress, setTxProgress] = useState<TxProgressState | null>(null);
  const txProgressRef = useRef<TxProgressState | null>(null);

  const startTxProgress = useCallback((title: string, stepLabels: string[]) => {
    const steps: TxStep[] = stepLabels.map((label) => ({
      label,
      status: "pending" as TxStepStatus,
      detail: "",
    }));
    const state: TxProgressState = { title, steps, startTime: Date.now() };
    txProgressRef.current = state;
    setTxProgress({ ...state });
    return state;
  }, []);

  const updateTxStep = useCallback((idx: number, status: TxStepStatus, detail?: string) => {
    const s = txProgressRef.current;
    if (!s) return;
    s.steps[idx] = { ...s.steps[idx], status, detail: detail || "" };
    txProgressRef.current = { ...s };
    setTxProgress({ ...s });
  }, []);

  const closeTxProgress = useCallback((delayMs = 3000) => {
    setTimeout(() => {
      txProgressRef.current = null;
      setTxProgress(null);
    }, delayMs);
  }, []);

  return { txProgress, startTxProgress, updateTxStep, closeTxProgress };
}
