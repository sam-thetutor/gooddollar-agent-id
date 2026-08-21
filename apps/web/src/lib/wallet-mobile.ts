/** WalletConnect registry id for MetaMask (mobile deep-link target). */
export const METAMASK_WALLET_ID =
  "c57ca95a47517794e3bf213b5da8df63640a96fd8bc6145ca71bd446dbb20212";

/** Public client id — must match the Privy dashboard WalletConnect project. */
export const WALLETCONNECT_PROJECT_ID =
  (import.meta.env.VITE_WALLETCONNECT_PROJECT_ID as string | undefined)?.trim() ||
  "6e8f2397a02218d02f0e4eb026af2831";

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
