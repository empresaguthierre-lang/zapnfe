import "server-only";

import { requireOrganizationRole } from "@/lib/auth/authorization";
import { databaseErrorMessage, type ActionResult } from "@/lib/erp/shared/types";
import { createClient } from "@/lib/supabase/server";
import { reverseMovementSchema, stockAdjustmentSchema, warehouseInputSchema } from "./schemas";

export async function adjustStock(input: unknown): Promise<ActionResult> {
  const member = await requireOrganizationRole(["admin", "manager"]);
  const parsed = stockAdjustmentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Revise os dados da movimentação.", fieldErrors: parsed.error.flatten().fieldErrors };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("inventory_adjust_stock", { organization_id: member.organizationId, warehouse_id: parsed.data.warehouseId, product_id: parsed.data.productId, adjustment_type: parsed.data.adjustmentType, quantity: parsed.data.quantity, unit_cost: parsed.data.unitCost, notes: parsed.data.notes || null });
  if (error) return { ok: false, message: inventoryError(error.message) };
  return { ok: true, message: "Movimentação registrada no livro de estoque.", id: String(data) };
}

export async function reverseMovement(input: unknown): Promise<ActionResult> {
  await requireOrganizationRole(["admin", "manager"]);
  const parsed = reverseMovementSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Informe um motivo válido para a reversão.", fieldErrors: parsed.error.flatten().fieldErrors };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("inventory_reverse_movement", { target_movement_id: parsed.data.movementId, reversal_reason: parsed.data.reason });
  if (error) return { ok: false, message: inventoryError(error.message) };
  return { ok: true, message: "Movimentação revertida com lançamento compensatório.", id: String(data) };
}

export async function saveWarehouse(input: unknown): Promise<ActionResult> {
  const member = await requireOrganizationRole(["admin", "manager"]);
  const parsed = warehouseInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Revise os dados do depósito.", fieldErrors: parsed.error.flatten().fieldErrors };
  const supabase = await createClient();
  const payload = { organization_id: member.organizationId, branch_id: parsed.data.branchId, code: parsed.data.code, name: parsed.data.name, active: parsed.data.active };
  const request = parsed.data.id
    ? supabase.from("warehouses").update(payload).eq("id", parsed.data.id).eq("organization_id", member.organizationId).select("id").single()
    : supabase.from("warehouses").insert(payload).select("id").single();
  const { data, error } = await request;
  if (error || !data) return { ok: false, message: databaseErrorMessage("salvar o depósito") };
  return { ok: true, message: "Depósito salvo com sucesso.", id: String(data.id) };
}

function inventoryError(message: string) {
  if (message.includes("INVENTORY_ACCESS_DENIED")) return "Seu perfil não pode alterar o estoque.";
  if (message.includes("INSUFFICIENT_STOCK")) return "Saldo insuficiente para esta saída.";
  if (message.includes("ALREADY_REVERSED")) return "Esta movimentação já foi revertida.";
  if (message.includes("NOT_FOUND")) return "Produto, depósito ou movimentação não encontrado.";
  return databaseErrorMessage("registrar a movimentação");
}
