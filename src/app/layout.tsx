import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { WalletProvider } from "@/components/WalletProvider";
import { UnifiedWalletProvider } from "@/hooks/useUnifiedWallet";
import { GameProvider } from "@/components/GameProvider";
import { NavBar } from "@/components/NavBar";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Level Up By Yourself",
  description: "A Solana-connected idle/collection game",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <WalletProvider>
          <UnifiedWalletProvider>
            <GameProvider>
              {children}
              <div className="text-center text-gray-600 text-xs font-mono py-2">v1.0.0</div>
              <NavBar />
            </GameProvider>
          </UnifiedWalletProvider>
        </WalletProvider>
      </body>
    </html>
  );
}
