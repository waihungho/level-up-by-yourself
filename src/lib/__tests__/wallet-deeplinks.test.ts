import { describe, it, expect } from "vitest";
import { needsWalletAppRedirect, phantomBrowseUrl, solflareBrowseUrl } from "@/lib/wallet-deeplinks";

const IOS_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const IOS_CHROME =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1";
const DESKTOP = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/130.0 Safari/537.36";
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36";

describe("needsWalletAppRedirect", () => {
  it("is true on iPhone Safari / Chrome with no injected wallet", () => {
    expect(needsWalletAppRedirect(IOS_SAFARI, false)).toBe(true);
    expect(needsWalletAppRedirect(IOS_CHROME, false)).toBe(true);
  });

  it("is false inside a wallet's in-app browser (wallet injected)", () => {
    expect(needsWalletAppRedirect(IOS_SAFARI, true)).toBe(false);
  });

  it("is false on desktop and Android", () => {
    expect(needsWalletAppRedirect(DESKTOP, false)).toBe(false);
    expect(needsWalletAppRedirect(ANDROID, false)).toBe(false);
  });
});

describe("browse links", () => {
  const href = "https://level-up-by-yourself.vercel.app/agents/abc?x=1";

  it("builds the Phantom universal link that opens the page in Phantom's browser", () => {
    expect(phantomBrowseUrl(href)).toBe(
      "https://phantom.app/ul/browse/https%3A%2F%2Flevel-up-by-yourself.vercel.app%2Fagents%2Fabc%3Fx%3D1?ref=https%3A%2F%2Flevel-up-by-yourself.vercel.app"
    );
  });

  it("builds the Solflare universal link", () => {
    expect(solflareBrowseUrl(href)).toBe(
      "https://solflare.com/ul/v1/browse/https%3A%2F%2Flevel-up-by-yourself.vercel.app%2Fagents%2Fabc%3Fx%3D1?ref=https%3A%2F%2Flevel-up-by-yourself.vercel.app"
    );
  });
});
