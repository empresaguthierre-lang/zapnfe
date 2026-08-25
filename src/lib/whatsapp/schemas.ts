import { z } from "zod";

const textMessageSchema = z.object({
  from: z.string().min(5),
  id: z.string().min(1),
  timestamp: z.string().optional(),
  type: z.string(),
  text: z.object({ body: z.string().min(1).max(5000) }).optional(),
});

const changeValueSchema = z.object({
  metadata: z.object({ phone_number_id: z.string().min(1), display_phone_number: z.string().optional() }),
  contacts: z.array(z.object({ profile: z.object({ name: z.string().optional() }).optional(), wa_id: z.string() })).optional(),
  messages: z.array(textMessageSchema).optional(),
}).passthrough();

export const metaWebhookSchema = z.object({
  object: z.literal("whatsapp_business_account"),
  entry: z.array(z.object({
    changes: z.array(z.object({ field: z.string(), value: changeValueSchema })),
  })),
});

export type MetaWebhook = z.infer<typeof metaWebhookSchema>;
