"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

/** Bump when announcing a new release so the banner shows again for everyone. */
const RELEASE = "2026-10-gem-shop-gear";
const STORAGE_KEY = `whats_new_dismissed_${RELEASE}`;

const FEATURES = [
  { href: "/shop", icon: "💎", title: "Gem Shop & Gear", text: "Elixirs, boosts, cosmetics — and upgradeable weapons, armor and relics." },
  { href: "/battle", icon: "⚔", title: "Tactical Battles", text: "Read the enemy's move, counter it, and fire role Specials." },
  { href: "/squad", icon: "⛨", title: "Squad 3v3", text: "Field 3 agents, tag-swap mid-fight and climb the squad rating." },
  { href: "/raid", icon: "🐉", title: "World Boss Raid", text: "Team up with everyone to take down this week's boss." },
];

export function WhatsNewBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      // storage unavailable: show the banner
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is only readable after mount
    setVisible(!dismissed);
  }, []);

  function dismiss() {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // storage unavailable: hides for this visit only
    }
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <section className="relative mb-4 rounded-lg border border-purple-600/50 bg-gradient-to-br from-purple-950/70 to-gray-900 p-4" aria-label="What's new">
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss what's new"
        className="absolute top-1 right-1 w-9 h-9 flex items-center justify-center text-gray-400 hover:text-white font-mono"
      >
        ×
      </button>
      <h2 className="font-mono text-sm font-bold text-purple-200 mb-2">✨ What&apos;s new</h2>
      <ul className="space-y-2">
        {FEATURES.map((f) => (
          <li key={f.href}>
            <Link href={f.href} className="flex gap-2 items-start rounded px-1 py-0.5 hover:bg-white/5">
              <span className="text-base leading-5" aria-hidden="true">
                {f.icon}
              </span>
              <span className="font-mono text-xs">
                <span className="font-bold text-white">{f.title}</span>
                <span className="text-gray-400"> — {f.text}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
