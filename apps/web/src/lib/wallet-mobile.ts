/** WalletConnect registry id for MetaMask (mobile deep-link target). */
export const METAMASK_WALLET_ID =
  "c57ca95a47517794e3bf213b5da8df63640a96fd8bc6145ca71bd446dbb20212";

export function isMobileBrowser(): boolean {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

export function isIOS(): boolean {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent);
}

export function hasInjectedProvider(): boolean {
  return Boolean(
    (window as Window & { ethereum?: unknown }).ethereum,
  );
}

/** Mobile Safari/Chrome have no extension injection — use WalletConnect deep link. */
export function shouldUseWalletConnect(): boolean {
  return isMobileBrowser() && !hasInjectedProvider();
}

/** Opens the current page inside MetaMask's in-app browser (injected provider). */
export function openInMetaMaskBrowser(): void {
  const link = `https://metamask.app.link/dapp/${encodeURIComponent(window.location.href)}`;
  window.location.assign(link);
}

export function hasWalletConnectProjectId(): boolean {
  return Boolean(
    (import.meta.env.VITE_WALLETCONNECT_PROJECT_ID as string | undefined)?.trim(),
  );
}
