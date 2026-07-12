/** WalletConnect registry id for MetaMask (mobile deep-link target). */
export const METAMASK_WALLET_ID =
  "c57ca95a47517794e3bf213b5da8df63640a96fd8bc6145ca71bd446dbb20212";

/** Public client id — safe to ship in the bundle; env overrides for other environments. */
export const WALLETCONNECT_PROJECT_ID =
  (import.meta.env.VITE_WALLETCONNECT_PROJECT_ID as string | undefined)?.trim() ||
  "e4f0acb8bbf35146eb2bce8c7006d1c3";

export function isMobileBrowser(): boolean {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
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
