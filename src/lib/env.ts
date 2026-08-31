import "server-only";

import { z } from "zod";

const nonEmpty = z.string().min(1);

export function getSupabaseAdminEnv() {
  const url = z.url().parse(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const secretKey = nonEmpty.parse(process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY);
  return { url, secretKey };
}

export function getGeminiEnv() {
  return {
    apiKey: nonEmpty.parse(process.env.GEMINI_API_KEY),
    model: nonEmpty.parse(process.env.GEMINI_MODEL ?? "gemini-3.5-flash-lite"),
  };
}

export function getWhatsAppWebhookEnv() {
  return {
    verifyToken: nonEmpty.parse(process.env.WHATSAPP_VERIFY_TOKEN),
    appSecret: nonEmpty.parse(process.env.WHATSAPP_APP_SECRET),
  };
}
