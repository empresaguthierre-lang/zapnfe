"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrganizationMember, requireOrganizationRole } from "@/lib/auth/authorization";
import { normalizeUntrustedText } from "@/lib/security/input";
import { createClient } from "@/lib/supabase/server";

const reviewItemSchema = z.object({
  id: z.string().uuid(),
  productId: z.string().uuid().nullable(),
  quantity: z.number().positive().max(99_999_999),
  unitPrice: z.number().min(0).max(999_999_999_999),
  confirmed: z.boolean(),
});

const reviewSchema = z.object({
  orderId: z.string().uuid(),
  expectedUpdatedAt: z.string().datetime({ offset: true }),
  items: z.array(reviewItemSchema).min(1).max(100),
  discount: z.number().min(0).max(999_999_999_999),
  freight: z.number().min(0).max(999_999_999_999),
  notes: z.string().max(1000),
  approve: z.boolean(),
  forceApproval: z.boolean().default(false),
});

export type ReviewActionResult = { ok: true; status: "review" | "approved"; updatedAt: string; stockStatus?: string } | { ok: false; message: string; isInsufficientStock?: boolean; missingProductId?: string };

function reviewErrorMessage(message: string): { message: string; isInsufficientStock?: boolean; missingProductId?: string } {
  if (message === "ORDER_CONFLICT") return { message: "Este pedido foi alterado por outra pessoa. Atualize a página antes de continuar." };
  if (message === "ORDER_LOCKED") return { message: "Este pedido já foi aprovado ou encerrado e não pode mais ser alterado." };
  if (message === "ORDER_ACCESS_DENIED" || message === "ORDER_NOT_FOUND") return { message: "Pedido não encontrado para esta empresa." };
  if (message === "REVIEW_INCOMPLETE") return { message: "Confirme todos os produtos antes de aprovar o pedido." };
  if (message.startsWith("INSUFFICIENT_STOCK:")) {
    const productName = message.split("INSUFFICIENT_STOCK:")[1].trim();
    return { message: `⚠️ Estoque insuficiente para concluir a reserva. Em falta: ${productName}`, isInsufficientStock: true };
  }
  if (message === "NO_ACTIVE_WAREHOUSE") return { message: "Nenhum depósito ativo encontrado para a organização." };
  return { message: "Não foi possível salvar a conferência. Revise os dados e tente novamente." };
}

export async function saveOrderReviewAction(input: unknown): Promise<ReviewActionResult> {
  const member = await requireOrganizationMember();
  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Os dados da conferência são inválidos." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_order_review", {
    target_order_id: parsed.data.orderId,
    expected_organization_id: member.organizationId,
    expected_order_updated_at: parsed.data.expectedUpdatedAt,
    review_items: parsed.data.items.map((item) => ({
      id: item.id,
      product_id: item.productId,
      quantity: item.quantity,
      unit_price: item.unitPrice,
      confirmed: item.confirmed,
    })),
    review_discount: parsed.data.discount,
    review_freight: parsed.data.freight,
    review_notes: parsed.data.notes,
    mark_approved: parsed.data.approve,
    force_approval: parsed.data.forceApproval,
  });

  if (error) {
    const parsedError = reviewErrorMessage(error.message);
    return { ok: false, ...parsedError };
  }

  const result = z.object({
    status: z.enum(["review", "approved"]),
    updated_at: z.string().datetime({ offset: true }),
    stock_status: z.string().optional(),
  }).safeParse(data);
  if (!result.success) return { ok: false, message: "O pedido foi salvo, mas a confirmação do banco é inválida. Atualize a página." };

  revalidatePath("/");
  revalidatePath("/pedidos");
  revalidatePath(`/pedidos/${parsed.data.orderId}`);
  return { ok: true, status: result.data.status, updatedAt: result.data.updated_at, stockStatus: result.data.stock_status };
}

export async function cancelOrderAction(orderId: string): Promise<{ ok: boolean, message?: string }> {
  const member = await requireOrganizationRole(["admin", "manager"]);
  const parsedOrderId = z.string().uuid().safeParse(orderId);
  if (!parsedOrderId.success) return { ok: false, message: "Pedido inválido." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_order_and_release_stock", {
    order_id_param: parsedOrderId.data,
    expected_organization_id: member.organizationId
  });

  if (error) {
    if (error.message.includes("ORDER_NOT_FOUND")) return { ok: false, message: "Pedido não encontrado." };
    if (error.message.includes("ORDER_ALREADY_CANCELLED")) return { ok: false, message: "Pedido já está cancelado." };
    if (error.message.includes("ORDER_LOCKED")) return { ok: false, message: "Este pedido já foi faturado ou concluído e não pode ser cancelado." };
    return { ok: false, message: "Não foi possível cancelar o pedido." };
  }

  revalidatePath("/");
  revalidatePath("/pedidos");
  revalidatePath(`/pedidos/${orderId}`);
  return { ok: true };
}

export async function getActiveReservationsAction(productId: string) {
  const member = await requireOrganizationMember();
  const parsedProductId = z.string().uuid().safeParse(productId);
  if (!parsedProductId.success) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("inventory_reservation_details")
    .select("*")
    .eq("organization_id", member.organizationId)
    .eq("product_id", parsedProductId.data)
    .eq("reservation_status", "active")
    .order("reserved_at", { ascending: true });

  if (error) throw new Error("Não foi possível carregar as reservas.");
  return data;
}

export async function getInventoryOverviewAction(productId: string) {
  const member = await requireOrganizationMember();
  const parsedProductId = z.string().uuid().safeParse(productId);
  if (!parsedProductId.success) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("inventory_overview")
    .select("quantity_on_hand, quantity_reserved, quantity_available")
    .eq("organization_id", member.organizationId)
    .eq("product_id", parsedProductId.data)
    .maybeSingle();

  if (error) throw new Error("Não foi possível carregar o saldo do produto.");
  return data;
}

const reallocateSchema = z.object({
  sourceReservationId: z.string().uuid(),
  targetOrderItemId: z.string().uuid(),
  quantity: z.number().positive(),
  reason: z.string().transform((value) => normalizeUntrustedText(value, 1000)).pipe(z.string().min(5)),
});

export async function reallocateReservationAction(input: unknown) {
  await requireOrganizationRole(["admin", "manager"]);
  const parsed = reallocateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Dados inválidos." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("inventory_reallocate_reservation", {
    source_reservation_id: parsed.data.sourceReservationId,
    target_order_item_id: parsed.data.targetOrderItemId,
    reallocate_quantity: parsed.data.quantity,
    reallocation_reason: parsed.data.reason
  });

  if (error) return { ok: false, message: "Não foi possível realocar a reserva." };

  revalidatePath("/");
  revalidatePath("/pedidos");
  return { ok: true };
}

export async function getOrderAuditsAction(orderId: string) {
  const member = await requireOrganizationMember();
  const parsedOrderId = z.string().uuid().safeParse(orderId);
  if (!parsedOrderId.success) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("stock_reservation_audits")
    .select("*, created_by_user:created_by (name, email), source_order:source_order_id (number), target_order:target_order_id (number)")
    .eq("organization_id", member.organizationId)
    .or(`source_order_id.eq.${parsedOrderId.data},target_order_id.eq.${parsedOrderId.data}`)
    .order("created_at", { ascending: false });

  if (error) throw new Error("Não foi possível carregar a auditoria do pedido.");
  return data;
}

export async function getServicePriorityAction(orderId: string) {
  await requireOrganizationMember();
  const parsedOrderId = z.string().uuid().safeParse(orderId);
  if (!parsedOrderId.success) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("calculate_order_service_priority", {
    p_order_id: parsedOrderId.data
  });

  if (error) {
    return null;
  }
  return data;
}


export async function getCreditExposureAction(orderId: string) {
  const member = await requireOrganizationMember();
  const parsedOrderId = z.string().uuid().safeParse(orderId);
  if (!parsedOrderId.success) return null;
  const supabase = await createClient();

  const { data: order } = await supabase.from("orders").select("customer_id, total").eq("id", parsedOrderId.data).eq("organization_id", member.organizationId).single();
  if (!order) return null;

  const { data, error } = await supabase.rpc("finance_get_customer_credit_exposure", {
    p_org_id: member.organizationId,
    p_customer_id: order.customer_id,
    p_current_order_id: parsedOrderId.data,
    p_new_amount: order.total
  });

  if (error) {
    return null;
  }
  return data;
}

export async function generateFinanceFromOrderAction(orderId: string) {
  const member = await requireOrganizationRole(["admin", "manager"]);
  const parsedOrderId = z.string().uuid().safeParse(orderId);
  if (!parsedOrderId.success) return { ok: false, message: "Pedido inválido." };
  const supabase = await createClient();
  const { data: ownedOrder } = await supabase.from("orders").select("id").eq("id", parsedOrderId.data).eq("organization_id", member.organizationId).maybeSingle();
  if (!ownedOrder) return { ok: false, message: "Pedido não encontrado para esta empresa." };

  const { data, error } = await supabase.rpc("finance_generate_receivable_from_order", {
    p_order_id: parsedOrderId.data
  });

  if (error) {
    return { ok: false, message: "Não foi possível gerar o financeiro do pedido." };
  }

  revalidatePath("/");
  revalidatePath("/pedidos");
  revalidatePath(`/pedidos/${orderId}`);

  return { ok: true, receivableId: data };
}

// NOTE: issueInvoiceAction was removed during audit (M5).
// The real invoice creation flow uses prepareInvoiceDraftAction below,
// which calls fiscal_create_invoice_draft_from_order (with built-in assert).

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