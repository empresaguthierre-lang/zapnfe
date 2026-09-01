import "server-only";

import { requireOrganizationRole } from "@/lib/auth/authorization";
import { databaseErrorMessage, type ActionResult } from "@/lib/erp/shared/types";
import { createClient } from "@/lib/supabase/server";
import { categoryInputSchema, productInputSchema } from "./schemas";

export async function saveProduct(input: unknown): Promise<ActionResult> {
  const member = await requireOrganizationRole(["admin", "manager"]);
  const parsed = productInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Revise os campos do produto.", fieldErrors: parsed.error.flatten().fieldErrors };
  const supabase = await createClient();
  const payload = { organization_id: member.organizationId, sku: parsed.data.sku, name: parsed.data.name, description: parsed.data.description || null, barcode: parsed.data.barcode || null, category_id: parsed.data.categoryId, unit_id: parsed.data.unitId, unit: "UN", cost_price: parsed.data.costPrice, sale_price: parsed.data.salePrice, price: parsed.data.salePrice, minimum_stock: parsed.data.minimumStock, maximum_stock: parsed.data.maximumStock, track_stock: parsed.data.trackStock, active: parsed.data.active };
  const request = parsed.data.id
    ? supabase.from("products").update(payload).eq("id", parsed.data.id).eq("organization_id", member.organizationId).select("id").single()
    : supabase.from("products").insert(payload).select("id").single();
  const { data, error } = await request;
  if (error || !data) return { ok: false, message: error?.code === "23505" ? "Já existe um produto com este SKU ou código de barras." : databaseErrorMessage("salvar o produto") };
  return { ok: true, message: "Produto salvo com sucesso.", id: String(data.id) };
}

export async function saveCategory(input: unknown): Promise<ActionResult> {
  const member = await requireOrganizationRole(["admin", "manager"]);
  const parsed = categoryInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Revise os campos da categoria.", fieldErrors: parsed.error.flatten().fieldErrors };
  const supabase = await createClient();
  const payload = { organization_id: member.organizationId, code: parsed.data.code, name: parsed.data.name, parent_id: parsed.data.parentId, active: parsed.data.active };
  const request = parsed.data.id
    ? supabase.from("product_categories").update(payload).eq("id", parsed.data.id).eq("organization_id", member.organizationId).select("id").single()
    : supabase.from("product_categories").insert(payload).select("id").single();
  const { data, error } = await request;
  if (error || !data) return { ok: false, message: databaseErrorMessage("salvar a categoria") };
  return { ok: true, message: "Categoria salva com sucesso.", id: String(data.id) };
}
