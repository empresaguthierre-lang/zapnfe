"use server";

import { revalidatePath } from "next/cache";
import { saveCategory, saveProduct } from "@/lib/erp/catalog/mutations";
import type { ActionResult } from "@/lib/erp/shared/types";

export async function saveProductAction(_state: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const result = await saveProduct({ id: optionalString(formData, "id"), sku: stringValue(formData, "sku"), name: stringValue(formData, "name"), description: stringValue(formData, "description"), barcode: stringValue(formData, "barcode"), categoryId: stringValue(formData, "categoryId"), unitId: stringValue(formData, "unitId"), costPrice: stringValue(formData, "costPrice"), salePrice: stringValue(formData, "salePrice"), minimumStock: stringValue(formData, "minimumStock"), maximumStock: stringValue(formData, "maximumStock"), trackStock: formData.get("trackStock") === "on", active: formData.get("active") === "on" });
  if (result.ok) { revalidatePath("/"); revalidatePath("/produtos"); revalidatePath(`/erp/produtos/${result.id}`); }
  return result;
}

export async function saveCategoryAction(_state: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const result = await saveCategory({ id: optionalString(formData, "id"), code: stringValue(formData, "code"), name: stringValue(formData, "name"), parentId: stringValue(formData, "parentId"), active: formData.get("active") === "on" });
  if (result.ok) { revalidatePath("/categorias"); revalidatePath("/produtos"); }
  return result;
}

function stringValue(formData: FormData, key: string) { const value = formData.get(key); return typeof value === "string" ? value : ""; }
function optionalString(formData: FormData, key: string) { const value = stringValue(formData, key); return value || undefined; }

