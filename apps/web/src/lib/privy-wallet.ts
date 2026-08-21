import type { ConnectedWallet, User } from "@privy-io/react-auth";

export function isEmbeddedWallet(w: ConnectedWallet): boolean {
  return w.walletClientType === "privy" || w.walletClientType === "privy_v2";
}

export function walletLabel(w: ConnectedWallet): string {
  if (isEmbeddedWallet(w)) return "Privy wallet";
  const type = w.walletClientType ?? "wallet";
  if (type === "metamask") return "MetaMask";
  if (type === "coinbase_wallet") return "Coinbase";
  return type.replace(/_/g, " ");
}

/** Email/social users get a Privy embedded wallet by default. */
export function preferEmbeddedWallet(user: User | null): boolean {
  if (!user) return true;
  return Boolean(
    user.email ||
      user.google ||
      user.apple ||
      user.twitter ||
      user.discord ||
      user.github ||
      user.linkedin ||
      user.spotify ||
      user.instagram ||
      user.tiktok,
  );
}

export function pickDefaultWallet(
  wallets: ConnectedWallet[],
  user: User | null,
): ConnectedWallet | undefined {
  if (!wallets.length) return undefined;

  const embedded = wallets.find(isEmbeddedWallet);
  const external = wallets.find((w) => !isEmbeddedWallet(w));

  if (preferEmbeddedWallet(user)) {
    return embedded ?? external ?? wallets[0];
  }
  return external ?? embedded ?? wallets[0];
}

export function sameAddress(a?: string | null, b?: string | null): boolean {
  return Boolean(a && b && a.toLowerCase() === b.toLowerCase());
}
