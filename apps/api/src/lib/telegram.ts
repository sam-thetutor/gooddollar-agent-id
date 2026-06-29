import { createHmac, timingSafeEqual } from "node:crypto";

/** Send a chat message via the Bot API. Best-effort — never throws. */
export async function notifyTelegram(
  botToken: string,
  chatId: string,
  text: string,
): Promise<void> {
  if (!botToken) return;
  try {
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }),
    });
  } catch {
    // Confirmation is non-critical; ignore delivery failures.
  }
}

export interface InitDataResult {
  ok: boolean;
  telegramId?: string;
  reason?: string;
}

/**
 * Validate a Telegram WebApp `initData` string per the official spec:
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 *
 * Returns the authenticated Telegram user id when valid.
 */
export function validateInitData(
  initData: string,
  botToken: string,
  maxAgeSeconds = 86_400,
): InitDataResult {
  if (!initData) return { ok: false, reason: "missing_init_data" };

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return { ok: false, reason: "missing_hash" };
  params.delete("hash");

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");

  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
  const calculated = createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");

  const a = Buffer.from(calculated, "hex");
  const b = Buffer.from(hash, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: "bad_hash" };
  }

  const authDate = Number(params.get("auth_date") ?? "0");
  if (authDate > 0 && maxAgeSeconds > 0) {
    const ageSeconds = Math.floor(Date.now() / 1000) - authDate;
    if (ageSeconds > maxAgeSeconds) return { ok: false, reason: "expired" };
  }

  let telegramId: string | undefined;
  const userRaw = params.get("user");
  if (userRaw) {
    try {
      const user = JSON.parse(userRaw) as { id?: number };
      if (typeof user.id === "number") telegramId = user.id.toString();
    } catch {
      return { ok: false, reason: "bad_user" };
    }
  }

  return { ok: true, telegramId };
}
