import type { Category } from "@/lib/tactical/types";

export const CATEGORY_STYLE: Record<Category, { icon: string; text: string; border: string; bg: string; hex: string }> = {
  Physical: { icon: "✊", text: "text-red-300", border: "border-red-600/60", bg: "bg-red-900/30", hex: "#f87171" },
  Technical: { icon: "⚙", text: "text-cyan-300", border: "border-cyan-600/60", bg: "bg-cyan-900/30", hex: "#22d3ee" },
  Mental: { icon: "✦", text: "text-blue-300", border: "border-blue-600/60", bg: "bg-blue-900/30", hex: "#60a5fa" },
  Spiritual: { icon: "☯", text: "text-violet-300", border: "border-violet-600/60", bg: "bg-violet-900/30", hex: "#a78bfa" },
  Social: { icon: "☺", text: "text-amber-300", border: "border-amber-600/60", bg: "bg-amber-900/30", hex: "#fbbf24" },
};
