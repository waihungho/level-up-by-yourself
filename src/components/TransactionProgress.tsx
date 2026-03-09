"use client";

import { useEffect, useState } from "react";
import type { TxProgressState, TxStepStatus } from "@/hooks/useTxProgress";

const ICONS: Record<TxStepStatus, string> = {
  pending: "\u25CB",
  active: "\u25C9",
  done: "\u2713",
  error: "\u2717",
};

const COLORS: Record<TxStepStatus, string> = {
  pending: "text-gray-600",
  active: "text-blue-400",
  done: "text-green-400",
  error: "text-red-400",
};

const LABEL_COLORS: Record<TxStepStatus, string> = {
  pending: "text-gray-500",
  active: "text-gray-200",
  done: "text-green-400",
  error: "text-red-400",
};

export default function TransactionProgress({ state }: { state: TxProgressState }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - state.startTime) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [state.startTime]);

  return (
    <div className="fixed bottom-5 right-5 z-[99998] w-72 max-h-[60vh] overflow-auto rounded-xl bg-gray-950/95 border border-gray-700/50 shadow-2xl p-4 font-mono animate-slide-up">
      <div className="text-[11px] font-bold text-amber-400 mb-3 tracking-wide">
        {state.title}
      </div>
      {state.steps.map((step, i) => (
        <div
          key={i}
          className={`flex items-start gap-2 mb-1.5 transition-opacity duration-300 ${
            step.status === "pending" ? "opacity-40" : "opacity-100"
          }`}
        >
          <span
            className={`text-xs font-bold leading-4 w-3.5 text-center shrink-0 ${COLORS[step.status]} ${
              step.status === "active" ? "animate-pulse" : ""
            }`}
          >
            {ICONS[step.status]}
          </span>
          <div className="flex-1 min-w-0">
            <div className={`text-[10px] font-bold leading-4 ${LABEL_COLORS[step.status]}`}>
              {step.label}
            </div>
            {step.detail && (
              <div
                className={`text-[8px] mt-0.5 break-all ${
                  step.status === "error" ? "text-red-300" : "text-gray-500"
                }`}
              >
                {step.detail}
              </div>
            )}
          </div>
        </div>
      ))}
      <div className="text-[8px] text-gray-700 mt-2 text-right">{elapsed}s elapsed</div>
    </div>
  );
}
