"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrganizationMember } from "@/lib/auth/authorization";
import { createClient } from "@/lib/supabase/server";

const reviewItemSchema = z.object({
  id: z.uuid(),
  productId: z.uuid().nullable(),
  quantity: z.number().positive().max(99_999_999),
  unitPrice: z.number().min(0).max(999_999_999_999),
  confirmed: z.boolean(),
});

const reviewSchema = z.object({
  orderId: z.uuid(),
  expectedUpdatedAt: z.string().datetime({ offset: true }),
  items: z.array(reviewItemSchema).min(1).max(100),
  discount: z.number().min(0).max(999_999_999_999),
  freight: z.number().min(0).max(999_999_999_999),
  notes: z.string().max(1000),
  approve: z.boolean(),
});

export type ReviewActionResult = { ok: true; status: "review" | "approved"; updatedAt: string } | { ok: false; message: string };

function reviewErrorMessage(message: string) {
  if (message.includes("ORDER_CONFLICT")) return "Este pedido foi alterado por outra pessoa. Atualize a página antes de continuar.";
  if (message.includes("ORDER_LOCKED")) return "Este pedido já foi aprovado ou encerrado e não pode mais ser alterado.";
  if (message.includes("ORDER_ACCESS_DENIED") || message.includes("ORDER_NOT_FOUND")) return "Pedido não encontrado para esta empresa.";
  if (message.includes("REVIEW_INCOMPLETE")) return "Confirme todos os produtos antes de aprovar o pedido.";
  return "Não foi possível salvar a conferência. Revise os dados e tente novamente.";
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
  });

  if (error) return { ok: false, message: reviewErrorMessage(error.message) };

  const result = z.object({
    status: z.enum(["review", "approved"]),
    updated_at: z.string().datetime({ offset: true }),
  }).safeParse(data);
  if (!result.success) return { ok: false, message: "O pedido foi salvo, mas a confirmação do banco é inválida. Atualize a página." };

  revalidatePath("/");
  revalidatePath("/pedidos");
  revalidatePath(`/pedidos/${parsed.data.orderId}`);
  return { ok: true, status: result.data.status, updatedAt: result.data.updated_at };
}
