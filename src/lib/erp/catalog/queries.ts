import "server-only";

import { requireOrganizationMember } from "@/lib/auth/authorization";
import { escapePostgrestSearch, pageRange, PAGE_SIZE, type ListQuery } from "@/lib/erp/shared/query";
import type { PageResult, SelectOption } from "@/lib/erp/shared/types";
import { createClient } from "@/lib/supabase/server";

export type ProductRow = { id: string; sku: string; name: string; barcode: string | null; categoryName: string | null; unitCode: string | null; salePrice: number; trackStock: boolean; minimumStock: number; active: boolean };
export type ProductDetail = ProductRow & { description: string | null; categoryId: string | null; unitId: string | null; costPrice: number; maximumStock: number };
export type PartyRow = { id: string; code: string | null; name: string; tradeName: string | null; document: string | null; email: string | null; phone: string | null; active: boolean };
export type CategoryRow = { id: string; code: string; name: string; parentId: string | null; active: boolean };

async function catalogLookups(organizationId: string) {
  const supabase = await createClient();
  const [{ data: categories }, { data: units }] = await Promise.all([
    supabase.from("product_categories").select("id, name").eq("organization_id", organizationId),
    supabase.from("units").select("id, code").eq("organization_id", organizationId),
  ]);
  return {
    categories: new Map((categories ?? []).map((row) => [String(row.id), String(row.name)])),
    units: new Map((units ?? []).map((row) => [String(row.id), String(row.code)])),
  };
}

export async function listProducts(query: ListQuery): Promise<PageResult<ProductRow>> {
  const member = await requireOrganizationMember();
  const supabase = await createClient();
  const { from, to } = pageRange(query.page);
  let request = supabase.from("products").select("id, sku, name, barcode, category_id, unit_id, sale_price, track_stock, minimum_stock, active", { count: "exact" }).eq("organization_id", member.organizationId).order("name").range(from, to);
  const search = escapePostgrestSearch(query.q ?? "");
  if (search) request = request.or(`name.ilike.%${search}%,sku.ilike.%${search}%,barcode.ilike.%${search}%`);
  if (query.status === "active") request = request.eq("active", true);
  if (query.status === "inactive") request = request.eq("active", false);
  const [{ data, error, count }, lookups] = await Promise.all([request, catalogLookups(member.organizationId)]);
  if (error) throw new Error("Não foi possível carregar os produtos.");
  return { rows: (data ?? []).map((row) => ({ id: String(row.id), sku: String(row.sku), name: String(row.name), barcode: row.barcode ? String(row.barcode) : null, categoryName: row.category_id ? lookups.categories.get(String(row.category_id)) ?? null : null, unitCode: row.unit_id ? lookups.units.get(String(row.unit_id)) ?? null : null, salePrice: Number(row.sale_price ?? 0), trackStock: Boolean(row.track_stock), minimumStock: Number(row.minimum_stock ?? 0), active: Boolean(row.active) })), count: count ?? 0, page: query.page, pageSize: PAGE_SIZE };
}

export async function getProduct(id: string): Promise<ProductDetail | null> {
  const member = await requireOrganizationMember();
  const supabase = await createClient();
  const [{ data, error }, lookups] = await Promise.all([
    supabase.from("products").select("id, sku, name, description, barcode, category_id, unit_id, cost_price, sale_price, track_stock, minimum_stock, maximum_stock, active").eq("organization_id", member.organizationId).eq("id", id).maybeSingle(),
    catalogLookups(member.organizationId),
  ]);
  if (error) throw new Error("Não foi possível carregar o produto.");
  if (!data) return null;
  return { id: String(data.id), sku: String(data.sku), name: String(data.name), description: data.description ? String(data.description) : null, barcode: data.barcode ? String(data.barcode) : null, categoryId: data.category_id ? String(data.category_id) : null, categoryName: data.category_id ? lookups.categories.get(String(data.category_id)) ?? null : null, unitId: data.unit_id ? String(data.unit_id) : null, unitCode: data.unit_id ? lookups.units.get(String(data.unit_id)) ?? null : null, costPrice: Number(data.cost_price ?? 0), salePrice: Number(data.sale_price ?? 0), trackStock: Boolean(data.track_stock), minimumStock: Number(data.minimum_stock ?? 0), maximumStock: Number(data.maximum_stock ?? 0), active: Boolean(data.active) };
}

export async function getCatalogOptions(): Promise<{ categories: SelectOption[]; units: SelectOption[] }> {
  const member = await requireOrganizationMember();
  const supabase = await createClient();
  const [{ data: categories, error: categoryError }, { data: units, error: unitError }] = await Promise.all([
    supabase.from("product_categories").select("id, name").eq("organization_id", member.organizationId).eq("active", true).order("name"),
    supabase.from("units").select("id, code, name").eq("organization_id", member.organizationId).eq("active", true).order("name"),
  ]);
  if (categoryError || unitError) throw new Error("Não foi possível carregar as opções do catálogo.");
  return { categories: (categories ?? []).map((row) => ({ value: String(row.id), label: String(row.name) })), units: (units ?? []).map((row) => ({ value: String(row.id), label: `${String(row.code)} — ${String(row.name)}` })) };
}

export async function listCategories(): Promise<CategoryRow[]> {
  const member = await requireOrganizationMember();
  const supabase = await createClient();
  const { data, error } = await supabase.from("product_categories").select("id, code, name, parent_id, active").eq("organization_id", member.organizationId).order("name");
  if (error) throw new Error("Não foi possível carregar as categorias.");
  return (data ?? []).map((row) => ({ id: String(row.id), code: String(row.code), name: String(row.name), parentId: row.parent_id ? String(row.parent_id) : null, active: Boolean(row.active) }));
}

export async function listParties(kind: "customers" | "suppliers", query: ListQuery): Promise<PageResult<PartyRow>> {
  const member = await requireOrganizationMember();
  const supabase = await createClient();
  const { from, to } = pageRange(query.page);
  let request = supabase.from(kind).select("id, code, name, trade_name, document, email, phone, active", { count: "exact" }).eq("organization_id", member.organizationId).order("name").range(from, to);
  const search = escapePostgrestSearch(query.q ?? "");
  if (search) request = request.or(`name.ilike.%${search}%,trade_name.ilike.%${search}%,document.ilike.%${search}%`);
  const { data, error, count } = await request;
  if (error) throw new Error(`Não foi possível carregar ${kind === "customers" ? "os clientes" : "os fornecedores"}.`);
  return { rows: (data ?? []).map((row) => ({ id: String(row.id), code: row.code ? String(row.code) : null, name: String(row.name), tradeName: row.trade_name ? String(row.trade_name) : null, document: row.document ? String(row.document) : null, email: row.email ? String(row.email) : null, phone: row.phone ? String(row.phone) : null, active: Boolean(row.active) })), count: count ?? 0, page: query.page, pageSize: PAGE_SIZE };
}
