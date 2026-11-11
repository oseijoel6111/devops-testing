/**
 * Optional ChowSignal WhatsApp worker (see the texting-whatsapp repo).
 * Set WHATSAPP_WORKER_URL and WHATSAPP_WORKER_SECRET to enable it.
 * WHATSAPP_TEST_ALLOWLIST (comma-separated numbers) limits sends while testing.
 */
export function getWhatsAppWorkerConfig():
  | { url: string; secret: string }
  | undefined {
  const url = process.env.WHATSAPP_WORKER_URL?.trim().replace(/\/+$/, "");
  const secret = process.env.WHATSAPP_WORKER_SECRET?.trim();
  if (!url || !secret) return undefined;
  return { url, secret };
}

/**
 * Normalise a stored phone number to international digits (e.g. 233244123456).
 * Local numbers with a leading 0 get WHATSAPP_DEFAULT_COUNTRY_CODE (default 233).
 * Returns null when the number can't be used.
 */
export function normalizeWhatsAppPhone(
  raw: string | null | undefined,
  defaultCountryCode = process.env.WHATSAPP_DEFAULT_COUNTRY_CODE?.trim() || "233"
): string | null {
  let digits = (raw ?? "").replace(/\D/g, "");
  if (!digits) return null;

  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("0")) digits = `${defaultCountryCode}${digits.slice(1)}`;

  return digits.length >= 11 && digits.length <= 15 ? digits : null;
}

function getTestAllowlist(): Set<string> | undefined {
  const raw = process.env.WHATSAPP_TEST_ALLOWLIST?.trim();
  if (!raw) return undefined;

  const phones = raw
    .split(",")
    .map((p) => normalizeWhatsAppPhone(p))
    .filter((p): p is string => Boolean(p));
  return new Set(phones);
}

export type FoodMenuWhatsAppPayload = {
  event: "published" | "reminder";
  menuId: string;
  vendorName: string;
  weekStartDate?: string;
  weekEndDate?: string;
  selectionCloseDate: string;
  linkUrl: string;
  recipients: Array<{ phone: string; name: string }>;
};

export async function queueFoodMenuWhatsApp(
  payload: FoodMenuWhatsAppPayload
): Promise<void> {
  const worker = getWhatsAppWorkerConfig();
  if (!worker) return;

  const allowlist = getTestAllowlist();
  const recipients = allowlist
    ? payload.recipients.filter((r) => allowlist.has(r.phone))
    : payload.recipients;

  if (recipients.length === 0) {
    console.log(`[whatsapp] no recipients for ${payload.event} menu ${payload.menuId}`);
    return;
  }

  try {
    const res = await fetch(`${worker.url}/notifications/food-menu`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${worker.secret}`,
      },
      body: JSON.stringify({ ...payload, recipients }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      const t = await res.text().catch(() => "");
      console.error("[whatsapp] worker request failed:", res.status, t);
      return;
    }

    const data = (await res.json().catch(() => ({}))) as {
      jobId?: string | null;
      queued?: number;
      skipped?: number;
      duplicate?: boolean;
    };
    console.log(
      `[whatsapp] ${payload.event} menu ${payload.menuId}: queued ${data.queued ?? 0}, skipped ${data.skipped ?? 0}` +
        (data.duplicate ? " (duplicate, already sent)" : "") +
        (data.jobId ? `, job ${data.jobId}` : "")
    );
  } catch (e) {
    console.error("[whatsapp] worker error:", e);
  }
}
