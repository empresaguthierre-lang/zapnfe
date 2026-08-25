import { createAdminClient } from "@/lib/supabase/admin";
import { extractOrderFromText, type CatalogProduct } from "@/lib/orders/extract-order";
import type { MetaWebhook } from "@/lib/whatsapp/schemas";
import { publicErrorMessage } from "@/lib/security/input";

export async function processMetaWebhook(payload: MetaWebhook) {
  const supabase = createAdminClient();

  for (const entry of payload.entry) {
    for (const change of entry.changes) {
      if (change.field !== "messages" || !change.value.messages) continue;
      const phoneNumberId = change.value.metadata.phone_number_id;
      const { data: account, error: accountError } = await supabase.from("whatsapp_accounts").select("id, organization_id").eq("phone_number_id", phoneNumberId).eq("active", true).maybeSingle();
      if (accountError) throw accountError;
      if (!account) continue;

      for (const message of change.value.messages) {
        const senderName = change.value.contacts?.find((contact) => contact.wa_id === message.from)?.profile?.name;
        const body = message.text?.body ?? null;
        const providerTimestamp = message.timestamp ? new Date(Number(message.timestamp) * 1000).toISOString() : null;
        const { data: inbound, error: inboundError } = await supabase.from("whatsapp_inbound_messages").upsert({
          organization_id: account.organization_id, whatsapp_account_id: account.id, provider_message_id: message.id,
          sender_phone: message.from, sender_name: senderName, message_type: message.type, body,
          provider_timestamp: providerTimestamp, raw_payload: message,
          processing_status: message.type === "text" && body ? "received" : "ignored",
        }, { onConflict: "provider_message_id", ignoreDuplicates: true }).select("id").maybeSingle();
        if (inboundError) throw inboundError;
        if (!inbound || message.type !== "text" || !body) continue;

        try {
          const { data: productRows, error: productsError } = await supabase.from("products").select("id, sku, name, aliases, unit, price").eq("organization_id", account.organization_id).eq("active", true).limit(500);
          if (productsError) throw productsError;
          const products: CatalogProduct[] = (productRows ?? []).map((product) => ({ ...product, aliases: product.aliases ?? [], price: Number(product.price) }));
          const extraction = await extractOrderFromText(body, products);
          await supabase.from("whatsapp_inbound_messages").update({ extraction }).eq("id", inbound.id);

          if (!extraction.is_order || extraction.items.length === 0) {
            await supabase.from("whatsapp_inbound_messages").update({ processing_status: "ignored", processed_at: new Date().toISOString() }).eq("id", inbound.id);
            continue;
          }

          const { error: orderError } = await supabase.rpc("create_order_from_whatsapp", {
            target_message_id: inbound.id, extracted_customer_name: extraction.customer_name,
            extracted_notes: extraction.notes, extracted_confidence: extraction.confidence, extracted_items: extraction.items,
          });
          if (orderError) throw orderError;
        } catch (error) {
          const detail = publicErrorMessage(error);
          await supabase.from("whatsapp_inbound_messages").update({ processing_status: "failed", processing_error: detail.slice(0, 1000), processed_at: new Date().toISOString() }).eq("id", inbound.id);
        }
      }
    }
  }
}
