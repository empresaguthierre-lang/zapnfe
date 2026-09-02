import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOrganizationRole } from "@/lib/auth/authorization";

export async function prepareInvoiceDraftAction(orderId: string) {
  const member = await requireOrganizationRole(["admin", "manager"]);
  const parsedOrderId = z.string().uuid().safeParse(orderId);
  if (!parsedOrderId.success) return { ok: false, message: "Pedido inválido." };
  
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fiscal_create_invoice_draft_from_order", {
    p_order_id: parsedOrderId.data
  });
  
  if (error) {
    if (error.message.includes("UNAUTHORIZED")) return { ok: false, message: "Acesso negado." };
    if (error.message.includes("CUSTOMER_OPERATION_BLOCKED")) return { ok: false, message: "Cliente possui restrição bloqueante." };
    if (error.message.includes("FISCAL_READINESS_FAILED")) return { ok: false, message: "Pedido não está fiscalmente pronto." };
    return { ok: false, message: "Erro interno ao preparar NF-e." };
  }
  
  revalidatePath(`/pedidos/${orderId}`);
  return { ok: true, invoiceId: data };
}

export async function submitInvoiceAction(invoiceId: string, orderId: string) {
  const member = await requireOrganizationRole(["admin", "manager"]);
  const parsedInvoiceId = z.string().uuid().safeParse(invoiceId);
  
  if (!parsedInvoiceId.success) return { ok: false, message: "Fatura inválida." };

  const supabase = await createClient();
  
  // Call the official Outbox queuing RPC
  const { error } = await supabase.rpc("fiscal_queue_invoice_submission", {
    p_invoice_id: parsedInvoiceId.data
  });

  if (error) {
    if (error.message.includes("UNAUTHORIZED")) return { ok: false, message: "Acesso negado." };
    if (error.message.includes("INVALID_STATUS")) return { ok: false, message: "O documento não está em estado de Draft." };
    if (error.message.includes("CUSTOMER_OPERATION_BLOCKED")) return { ok: false, message: "Cliente com restrição impeditiva." };
    return { ok: false, message: "Falha ao enfileirar transmissão fiscal." };
  }
  
  revalidatePath(`/pedidos/${orderId}`);
  revalidatePath(`/fiscal/notas/${invoiceId}`);
  return { ok: true };
}