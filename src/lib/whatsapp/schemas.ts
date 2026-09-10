import { z } from "zod";
import { hasPotentiallyMaliciousContent, normalizePhone, normalizeUntrustedText } from "@/lib/security/input";

const text = (max: number) => z.string()
  .transform((value) => normalizeUntrustedText(value, max))
  .refine((value) => !hasPotentiallyMaliciousContent(value), "Conteúdo não permitido.");

const textMessageSchema = z.object({
  from: z.string().transform(normalizePhone).pipe(z.string().min(8).max(15)),
  id: text(200).pipe(z.string().min(1)),
  timestamp: z.string().regex(/^\d{1,14}$/).optional(),
  type: text(40).pipe(z.string().min(1)),
  text: z.object({ body: text(5000).pipe(z.string().min(1)) }).optional(),
});

const changeValueSchema = z.object({
  metadata: z.object({ phone_number_id: z.string().regex(/^\d{1,30}$/), display_phone_number: text(30).optional() }),
  contacts: z.array(z.object({ profile: z.object({ name: text(200).optional() }).optional(), wa_id: z.string().transform(normalizePhone).pipe(z.string().min(8).max(15)) })).max(100).optional(),
  messages: z.array(textMessageSchema).max(100).optional(),
}).passthrough();

export const metaWebhookSchema = z.object({
  object: z.literal("whatsapp_business_account"),
  entry: z.array(z.object({ changes: z.array(z.object({ field: text(80), value: changeValueSchema })).max(100) })).max(100),
});

export type MetaWebhook = z.infer<typeof metaWebhookSchema>;
