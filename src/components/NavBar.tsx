"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useGame } from "@/components/GameProvider";

interface NavItem {
  href: string;
  label: string;
  icon: string;
  special?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "⌂" },
  { href: "/agents", label: "Agents", icon: "▦" },
  { href: "/battle", label: "Battle", icon: "⚔" },
  { href: "/rank", label: "Rank", icon: "🏆" },
  { href: "/summon", label: "Summon", icon: "+" },
  { href: "/seeker-task", label: "Seeker Task", icon: "≡", special: true },
  { href: "/guide", label: "Guide", icon: "?" },
];

export function NavBar() {
  const { player } = useGame();
  const pathname = usePathname();

  if (!player) return null;

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-gray-900 border-t border-gray-800 z-50">
      <div className="max-w-2xl mx-auto flex">
        {NAV_ITEMS.map((item) => {
          const active = pathname.startsWith(item.href);
          if (item.special) {
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex-1 flex flex-col items-center py-2.5 font-mono text-[10px] transition-colors ${
                  active ? "text-green-400" : "text-green-400/70 hover:text-green-300"
                }`}
              >
                <span className={`text-[10px] px-2.5 py-1 rounded border font-bold tracking-wider mb-0.5 ${
                  active
                    ? "bg-green-500/20 border-green-500/50 text-green-400"
                    : "bg-green-500/10 border-green-500/30 text-green-400/80"
                }`}>
                  {item.icon} {item.label.toUpperCase()}
                </span>
              </Link>
            );
          }
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex-1 flex flex-col items-center py-3 font-mono text-xs transition-colors ${
                active ? "text-purple-400" : "text-gray-500 hover:text-gray-300"
              }`}
            >
              <span className="text-lg mb-0.5">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
