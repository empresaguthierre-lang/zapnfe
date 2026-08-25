import { z } from "zod";

const serverEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  GEMINI_API_KEY: z.string().min(1),
  WHATSAPP_ACCESS_TOKEN: z.string().min(1),
  WHATSAPP_PHONE_NUMBER_ID: z.string().min(1),
  WHATSAPP_VERIFY_TOKEN: z.string().min(1),
  WHATSAPP_APP_SECRET: z.string().min(1),
  FOCUS_NFE_TOKEN: z.string().min(1),
  FOCUS_NFE_ENVIRONMENT: z.enum(["homologacao", "producao"]),
  CERTIFICATE_ENCRYPTION_KEY: z.string().min(1),
});

export function getServerEnv() {
  return serverEnvSchema.parse(process.env);
}
