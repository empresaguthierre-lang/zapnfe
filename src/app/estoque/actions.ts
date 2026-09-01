"use server";

import { revalidatePath } from "next/cache";
import { adjustStock, reverseMovement, saveWarehouse } from "@/lib/erp/inventory/mutations";
import type { ActionResult } from "@/lib/erp/shared/types";

export async function adjustStockAction(_state: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const result = await adjustStock({ warehouseId: read(formData, "warehouseId"), productId: read(formData, "productId"), adjustmentType: read(formData, "adjustmentType"), quantity: read(formData, "quantity"), unitCost: read(formData, "unitCost"), notes: read(formData, "notes") });
  if (result.ok) revalidateInventory();
  return result;
}

export async function reverseMovementAction(_state: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const result = await reverseMovement({ movementId: read(formData, "movementId"), reason: read(formData, "reason") });
  if (result.ok) revalidateInventory();
  return result;
}

export async function saveWarehouseAction(_state: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const result = await saveWarehouse({ id: read(formData, "id") || undefined, branchId: read(formData, "branchId"), code: read(formData, "code"), name: read(formData, "name"), active: formData.get("active") === "on" });
  if (result.ok) { revalidatePath("/estoque/depositos"); revalidatePath("/estoque"); }
  return result;
}

function read(formData: FormData, key: string) { const value = formData.get(key); return typeof value === "string" ? value : ""; }
function revalidateInventory() { revalidatePath("/"); revalidatePath("/estoque"); revalidatePath("/estoque/movimentacoes"); }

