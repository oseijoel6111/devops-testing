import { getAuthAppUrl } from "@/lib/auth-app-url";
import {
  normalizeWhatsAppPhone,
  queueFoodMenuWhatsApp,
} from "@/lib/whatsapp-worker";

export type FoodMenuWhatsAppJobPayload = {
  event: "published" | "reminder";
  menu: {
    id: string;
    vendor: { name: string };
    weekStartDate: Date;
    weekEndDate: Date;
    selectionCloseDate: Date;
  };
  users: Array<{ name: string; firstName: string; phoneNumber: string }>;
};

/** Sends each user with a usable phone number a WhatsApp DM via the worker. */
export async function deliverFoodMenuWhatsApp(
  payload: FoodMenuWhatsAppJobPayload
): Promise<void> {
  const seen = new Set<string>();
  const recipients: Array<{ phone: string; name: string }> = [];
  let invalid = 0;

  for (const user of payload.users) {
    const phone = normalizeWhatsAppPhone(user.phoneNumber);
    if (!phone) {
      invalid += 1;
      continue;
    }
    if (seen.has(phone)) continue;

    seen.add(phone);
    recipients.push({ phone, name: user.firstName.trim() || user.name });
  }

  if (invalid > 0) {
    console.warn(
      `[whatsapp] ${invalid} user(s) skipped for menu ${payload.menu.id}: missing or invalid phone number`
    );
  }

  const { menu } = payload;

  await queueFoodMenuWhatsApp({
    event: payload.event,
    menuId: menu.id,
    vendorName: menu.vendor.name,
    weekStartDate: menu.weekStartDate.toISOString(),
    weekEndDate: menu.weekEndDate.toISOString(),
    selectionCloseDate: menu.selectionCloseDate.toISOString(),
    linkUrl: getAuthAppUrl("/food-orders"),
    recipients,
  });
}
