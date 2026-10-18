"use client";
import { useState } from "react";
import { challengePageUrl, shareText, xIntentUrl } from "@/lib/blinks/links";

/** Owner-only button on the agent page: share the challenge link (native sheet, else copy + X). */
export function ShareChallengeButton({ agentId, agentName }: { agentId: string; agentName: string }) {
  const [fallback, setFallback] = useState<{ url: string; copied: boolean } | null>(null);

  async function share() {
    const url = challengePageUrl(window.location.origin, agentId);
    const text = shareText(agentName);
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: `Fight ${agentName}`, text, url });
        return;
      } catch (e) {
        // Dismissing the sheet is not an error; anything else falls back to copy.
        if (e instanceof DOMException && e.name === "AbortError") return;
      }
    }
    let copied = false;
    try {
      await navigator.clipboard.writeText(url);
      copied = true;
    } catch {
      copied = false;
    }
    setFallback({ url, copied });
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded p-4 font-mono">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-gray-400">Let anyone fight {agentName} from a Blink.</p>
        <button onClick={share} className="shrink-0 rounded bg-red-600 hover:bg-red-500 px-3 py-2 text-sm font-bold">
          Share challenge
        </button>
      </div>
      {fallback && (
        <div className="mt-3 text-xs space-y-2">
          <p className="text-gray-400 break-all">{fallback.copied ? "Link copied: " : "Copy this link: "}{fallback.url}</p>
          <a
            href={xIntentUrl(shareText(agentName), fallback.url)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block rounded border border-gray-700 hover:border-gray-500 px-3 py-1"
          >
            Post on X
          </a>
        </div>
      )}
    </div>
  );
}
