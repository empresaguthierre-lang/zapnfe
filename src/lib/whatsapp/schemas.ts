import { z } from "zod";
import { normalizePhone, normalizeUntrustedText } from "@/lib/security/input";

const textMessageSchema = z.object({
  from: z.string().transform(normalizePhone).pipe(z.string().min(8).max(15)),
  id: z.string().min(1).max(200).transform((value) => normalizeUntrustedText(value, 200)),
  timestamp: z.string().regex(/^\d{1,14}$/).optional(),
  type: z.string().min(1).max(40).transform((value) => normalizeUntrustedText(value, 40)),
  text: z.object({ body: z.string().min(1).max(5000).transform((value) => normalizeUntrustedText(value, 5000)) }).optional(),
});

const changeValueSchema = z.object({
  metadata: z.object({ phone_number_id: z.string().regex(/^\d{1,30}$/), display_phone_number: z.string().max(30).optional() }),
  contacts: z.array(z.object({ profile: z.object({ name: z.string().max(200).transform((value) => normalizeUntrustedText(value, 200)).optional() }).optional(), wa_id: z.string().transform(normalizePhone).pipe(z.string().min(8).max(15)) })).max(100).optional(),
  messages: z.array(textMessageSchema).max(100).optional(),
}).passthrough();

export const metaWebhookSchema = z.object({
  object: z.literal("whatsapp_business_account"),
  entry: z.array(z.object({ changes: z.array(z.object({ field: z.string().max(80), value: changeValueSchema })).max(100) })).max(100),
});

export type MetaWebhook = z.infer<typeof metaWebhookSchema>;
