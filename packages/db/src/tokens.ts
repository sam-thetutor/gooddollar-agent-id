import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Stateless, short-lived link tokens that bind a Telegram id so a wallet can be
 * linked from contexts that lack Telegram `initData` (MiniPay's in-app browser,
 * Safari/Chrome). The token is HMAC-signed with a server secret and carries an
 * expiry; the API verifies it as an alternative to `initData`.
 */

function secret(): string {
  const s = process.env.LINK_TOKEN_SECRET || process.env.TELEGRAM_BOT_TOKEN;
  if (!s) {
    throw new Error(
      "LINK_TOKEN_SECRET or TELEGRAM_BOT_TOKEN is required to sign link tokens",
    );
  }
  return s;
}

function b64url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromB64url(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

/** Mint a signed token binding `telegramId`, valid for `ttlSeconds`. */
export function signLinkToken(telegramId: string, ttlSeconds = 1800): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = `${telegramId}.${exp}`;
  const sig = createHmac("sha256", secret()).update(payload).digest();
  return `${b64url(Buffer.from(payload, "utf8"))}.${b64url(sig)}`;
}

export interface LinkTokenResult {
  ok: boolean;
  telegramId?: string;
  reason?: string;
}

/** Verify a token minted by {@link signLinkToken}; returns the bound id. */
export function verifyLinkToken(token: string): LinkTokenResult {
  if (!token) return { ok: false, reason: "missing_token" };
  const parts = token.split(".");
  if (parts.length !== 2) return { ok: false, reason: "malformed" };

  let payload: string;
  try {
    payload = fromB64url(parts[0]).toString("utf8");
  } catch {
    return { ok: false, reason: "malformed" };
  }

  const [telegramId, expStr] = payload.split(".");
  if (!telegramId || !expStr) return { ok: false, reason: "malformed" };

  const expected = createHmac("sha256", secret()).update(payload).digest();
  let provided: Buffer;
  try {
    provided = fromB64url(parts[1]);
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (
    expected.length !== provided.length ||
    !timingSafeEqual(expected, provided)
  ) {
    return { ok: false, reason: "bad_signature" };
  }

  if (Math.floor(Date.now() / 1000) > Number(expStr)) {
    return { ok: false, reason: "expired" };
  }

  return { ok: true, telegramId };
}
