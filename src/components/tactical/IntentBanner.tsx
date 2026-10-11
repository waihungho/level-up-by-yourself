import { counterFor } from "@/lib/tactical/engine";
import type { Intent } from "@/lib/tactical/types";
import { CATEGORY_STYLE } from "./categoryStyle";

export function IntentBanner({ name, intent, showHint }: { name: string; intent: Intent; showHint: boolean }) {
  if (intent.kind === "stunned") {
    return <div className="text-center font-mono text-sm py-2 rounded border border-gray-700 bg-gray-900 text-gray-300">💫 {name} is stunned!</div>;
  }
  if (intent.kind === "special") {
    return (
      <div className="text-center font-mono text-sm py-2 rounded border border-yellow-600/60 bg-yellow-900/20 text-yellow-300 animate-pulseGlow">
        ⚠ {name} is charging a SPECIAL — Guard!
      </div>
    );
  }
  const style = CATEGORY_STYLE[intent.category];
  if (intent.kind === "ultimate") {
    return (
      <div className="text-center font-mono text-sm py-2 rounded border border-red-500 bg-red-900/40 text-red-200 font-bold animate-pulseGlow">
        ☠ ULTIMATE incoming ({intent.category.toUpperCase()}) — GUARD!
      </div>
    );
  }
  return (
    <div className={`text-center font-mono text-sm py-2 rounded border ${style.border} ${style.bg}`}>
      <span className="text-gray-300">⚠ {name} is charging </span>
      <span className={`font-bold ${style.text}`}>
        {style.icon} {intent.category.toUpperCase()}
      </span>
      {showHint && <span className="text-gray-500 text-xs"> (counter: {counterFor(intent.category)})</span>}
    </div>
  );
}
