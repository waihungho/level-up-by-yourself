"use client";
import type { ReactNode } from "react";
import { CYCLE, SPECIAL_COST, SPECIALS } from "@/lib/tactical/constants";
import { counterFor } from "@/lib/tactical/engine";
import type { Action, Intent } from "@/lib/tactical/types";
import type { RoleCategory } from "@/lib/types";
import { CATEGORY_STYLE } from "./categoryStyle";

interface ActionGridProps {
  intent: Intent;
  focus: number;
  role: RoleCategory;
  stunned: boolean;
  disabled: boolean;
  showHint: boolean;
  onAction: (action: Action) => void;
  /** Extra controls rendered before Auto (e.g. the squad Swap menu). */
  extra?: ReactNode;
}

const BTN = "min-h-[44px] rounded-lg border font-mono text-xs font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed";

export function ActionGrid({ intent, focus, role, stunned, disabled, showHint, onAction, extra }: ActionGridProps) {
  if (stunned) {
    return (
      <button type="button" disabled={disabled} onClick={() => onAction({ type: "guard" })} className={`${BTN} w-full border-gray-600 bg-gray-800 text-gray-200`}>
        💫 Continue (stunned)
      </button>
    );
  }
  const counter = showHint && intent.kind === "strike" ? counterFor(intent.category) : null;
  const special = SPECIALS[role];
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        {CYCLE.map((c) => {
          const s = CATEGORY_STYLE[c];
          const isCounter = counter === c;
          return (
            <button
              key={c}
              type="button"
              disabled={disabled}
              onClick={() => onAction({ type: "strike", category: c })}
              className={`${BTN} ${s.border} ${s.bg} ${s.text} hover:brightness-125 ${isCounter ? "ring-2 ring-yellow-400" : ""}`}
            >
              {s.icon} {c}
              {isCounter && <span className="ml-1 text-yellow-300">★</span>}
            </button>
          );
        })}
        <button type="button" disabled={disabled} onClick={() => onAction({ type: "guard" })} className={`${BTN} border-gray-500 bg-gray-800 text-gray-200 hover:bg-gray-700`}>
          🛡 Guard
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={disabled || focus < SPECIAL_COST}
          onClick={() => onAction({ type: "special" })}
          className={`${BTN} border-yellow-500/70 bg-yellow-900/30 text-yellow-300 hover:bg-yellow-900/50`}
        >
          ✦ {special.name} ({SPECIAL_COST})
        </button>
        {extra}
        <button type="button" disabled={disabled} onClick={() => onAction({ type: "auto" })} className={`${BTN} border-purple-500/70 bg-purple-900/30 text-purple-200 hover:bg-purple-900/50`}>
          Auto ▶▶
        </button>
      </div>
    </div>
  );
}
