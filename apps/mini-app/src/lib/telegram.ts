import WebApp from "@twa-dev/sdk";

/** Call once on app load — safe to no-op outside Telegram. */
export function initTelegram(): void {
  try {
    WebApp.ready();
    WebApp.expand();
  } catch {
    // Not running inside Telegram (browser fallback).
  }
}

/** Raw initData string for server-side HMAC validation. */
export function getInitData(): string {
  try {
    if (WebApp.initData) return WebApp.initData;
  } catch {
    // ignore
  }
  // External-browser fallback: initData forwarded via the `?initData=` param
  // when the user escapes Telegram's webview via "Open in browser".
  return new URLSearchParams(window.location.search).get("initData") ?? "";
}

/**
 * Build a URL to the current page that carries the Telegram id + initData, so
 * the device's real browser can complete wallet linking (the in-app webview
 * blocks the WalletConnect relay/QR on desktop).
 */
export function buildExternalUrl(): string {
  const url = new URL(window.location.href);
  const id = getTelegramId();
  if (id) url.searchParams.set("tg", id);
  const initData = getInitData();
  if (initData) url.searchParams.set("initData", initData);
  return url.toString();
}

/**
 * MetaMask "dapp" deep link that opens our connect page **inside MetaMask's own
 * in-app browser**, where the injected provider is available — no WalletConnect
 * relay or app-to-app handoff needed (those are blocked in Telegram's webview).
 */
export function buildMetaMaskDappLink(): string {
  const target = buildExternalUrl().replace(/^https?:\/\//, "");
  return `https://metamask.app.link/dapp/${target}`;
}

/** Signed link token from the `?token=` query param (browser/MiniPay linking). */
export function getLinkToken(): string | null {
  const t = new URLSearchParams(window.location.search).get("token");
  return t && t.length > 0 ? t : null;
}

/** True when running inside MiniPay's in-app browser (injected provider). */
export function isMiniPay(): boolean {
  try {
    return Boolean(
      (window as { ethereum?: { isMiniPay?: boolean } }).ethereum?.isMiniPay,
    );
  } catch {
    return false;
  }
}

/** Telegram user id from initData, falling back to the `?tg=` query param. */
export function getTelegramId(): string | null {
  try {
    const id = WebApp.initDataUnsafe?.user?.id;
    if (typeof id === "number") return id.toString();
  } catch {
    // ignore
  }
  const fromQuery = new URLSearchParams(window.location.search).get("tg");
  return fromQuery && fromQuery.length > 0 ? fromQuery : null;
}

export function isInsideTelegram(): boolean {
  try {
    return Boolean(WebApp.initData) || Boolean(WebApp.initDataUnsafe?.user);
  } catch {
    return false;
  }
}

/**
 * True when running inside Telegram's desktop/web client, whose webview blocks
 * the WalletConnect relay (blank QR). On these we must use the external browser.
 */
export function isTelegramDesktop(): boolean {
  try {
    const p = WebApp.platform ?? "";
    return ["tdesktop", "macos", "windows", "linux", "web", "weba", "webk"].includes(
      p,
    );
  } catch {
    return false;
  }
}

/** Open a URL in the device's real browser (escapes Telegram's in-app webview). */
export function openExternal(url: string): void {
  try {
    WebApp.openLink(url, { try_instant_view: false });
  } catch {
    window.open(url, "_blank");
  }
}

export function closeApp(): void {
  try {
    WebApp.close();
  } catch {
    // ignore
  }
}
