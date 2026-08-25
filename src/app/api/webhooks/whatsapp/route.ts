import { after } from "next/server";
import { getWhatsAppWebhookEnv } from "@/lib/env";
import { processMetaWebhook } from "@/lib/whatsapp/process-webhook";
import { metaWebhookSchema } from "@/lib/whatsapp/schemas";
import { hasValidMetaSignature } from "@/lib/whatsapp/signature";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  const { verifyToken } = getWhatsAppWebhookEnv();

  if (mode === "subscribe" && token === verifyToken && challenge) {
    return new Response(challenge, { status: 200, headers: { "content-type": "text/plain" } });
  }
  return Response.json({ error: "Verificação recusada" }, { status: 403 });
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");
  const { appSecret } = getWhatsAppWebhookEnv();

  if (!hasValidMetaSignature(rawBody, signature, appSecret)) {
    return Response.json({ error: "Assinatura inválida" }, { status: 401 });
  }

  let json: unknown;
  try { json = JSON.parse(rawBody); } catch { return Response.json({ error: "JSON inválido" }, { status: 400 }); }
  const parsed = metaWebhookSchema.safeParse(json);
  if (!parsed.success) return Response.json({ error: "Evento não suportado" }, { status: 400 });

  after(async () => {
    try { await processMetaWebhook(parsed.data); }
    catch (error) { console.error("Falha ao processar webhook WhatsApp", error); }
  });

  return Response.json({ received: true });
}
