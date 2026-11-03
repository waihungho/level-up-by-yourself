/**
 * iOS has no wallet browser extensions, so Safari/Chrome on iPhone can't connect directly.
 * The page has to be reopened inside the wallet app's own browser via a universal link.
 * iOS only hands a universal link to the app when the user taps it, so these URLs
 * must go in a real <a href>. A programmatic `window.location` redirect (what
 * PhantomWalletAdapter.connect() does) just opens phantom.app in Safari.
 */

/** True on iPhone/iPad when no wallet is injected, so the user has to switch to a wallet app. */
export function needsWalletAppRedirect(userAgent: string, walletInjected: boolean): boolean {
  if (walletInjected) return false;
  const ua = userAgent.toLowerCase();
  return ua.includes("iphone") || ua.includes("ipad");
}

/** Whether a Solana wallet provider is injected into this page (in-app wallet browser). */
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
