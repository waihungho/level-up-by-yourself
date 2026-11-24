/**
 * iOS has no wallet browser extensions, so Safari/Chrome on iPhone can't connect directly.
 * The page has to be reopened inside the wallet app's own browser via a universal link.
 * iOS only hands a universal link to the app when the user taps it, so these URLs
 * must go in a real <a href>. A programmatic `window.location` redirect (what
 * PhantomWalletAdapter.connect() does) just opens phantom.app in Safari.
 */

/**
 * True on iPhone/iPad. iPadOS 13+ Safari reports a desktop Mac user agent, so a
 * "Macintosh" with a touch screen is an iPad.
 */
export function isIosDevice(userAgent: string, maxTouchPoints: number): boolean {
  const ua = userAgent.toLowerCase();
  if (ua.includes("iphone") || ua.includes("ipad")) return true;
  return ua.includes("macintosh") && maxTouchPoints > 1;
}

/**
 * Whether a Solana wallet provider is injected into this page under a legacy global.
 * Wallet Standard wallets are covered by the adapter's `Installed` ready state instead.
 */
export function hasInjectedWallet(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as unknown as {
    phantom?: { solana?: { isPhantom?: boolean } };
    solana?: unknown;
    solflare?: unknown;
  };
  return !!(w.phantom?.solana?.isPhantom || w.solana || w.solflare);
}

function browseUrl(base: string, href: string): string {
  const origin = new URL(href).origin;
  return `${base}${encodeURIComponent(href)}?ref=${encodeURIComponent(origin)}`;
}

export function phantomBrowseUrl(href: string): string {
  return browseUrl("https://phantom.app/ul/browse/", href);
}

export function solflareBrowseUrl(href: string): string {
  return browseUrl("https://solflare.com/ul/v1/browse/", href);
}
