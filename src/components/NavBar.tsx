"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useGame } from "@/components/GameProvider";

interface NavItem {
  href: string;
  label: string;
  icon: string;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Home", icon: "⌂" },
  { href: "/agents", label: "Agents", icon: "▦" },
  { href: "/battle", label: "Battle", icon: "⚔" },
  { href: "/rank", label: "Rank", icon: "🏆" },
  { href: "/summon", label: "Summon", icon: "+" },
  { href: "/guide", label: "Guide", icon: "?" },
];

export function NavBar() {
  const { player } = useGame();
  const pathname = usePathname();

  if (!player) return null;

  return (
    <>
      {/* Bottom Nav */}
      <nav className="fixed bottom-0 left-0 right-0 bg-gray-900 border-t border-gray-800 z-50 pb-[env(safe-area-inset-bottom)]">
        <div className="max-w-2xl mx-auto flex">
          {NAV_ITEMS.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex-1 flex flex-col items-center py-3 font-mono text-[10px] transition-colors min-w-0 ${
                  active ? "text-purple-400" : "text-gray-500 hover:text-gray-300"
                }`}
              >
                <span className="text-lg mb-0.5">{item.icon}</span>
                <span className="truncate w-full text-center">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
