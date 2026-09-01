import "server-only";

import { requireOrganizationMember } from "@/lib/auth/authorization";
import { escapePostgrestSearch, pageRange, PAGE_SIZE, type ListQuery } from "@/lib/erp/shared/query";
import type { PageResult, SelectOption } from "@/lib/erp/shared/types";
import { createClient } from "@/lib/supabase/server";

export type InventoryRow = { productId: string; sku: string; name: string; categoryName: string | null; unitCode: string | null; onHand: number; reserved: number; available: number; minimum: number; status: string; active: boolean };
export type MovementRow = { id: string; productId: string; productName: string; warehouseId: string; warehouseName: string; type: string; quantity: number; unitCost: number | null; notes: string | null; occurredAt: string; reversalOfId: string | null };
export type WarehouseRow = { id: string; branchId: string | null; branchName: string | null; code: string; name: string; active: boolean };

export async function listInventory(query: ListQuery): Promise<PageResult<InventoryRow>> {
  const member = await requireOrganizationMember();
  const supabase = await createClient();
  const { from, to } = pageRange(query.page);
  let request = supabase.from("inventory_overview").select("product_id, sku, name, category_name, unit_code, quantity_on_hand, quantity_reserved, quantity_available, minimum_stock, stock_status, active", { count: "exact" }).eq("organization_id", member.organizationId).order("name").range(from, to);
  const search = escapePostgrestSearch(query.q ?? "");
  if (search) request = request.or(`name.ilike.%${search}%,sku.ilike.%${search}%,barcode.ilike.%${search}%`);
  if (query.status) request = request.eq("stock_status", query.status);
  const { data, error, count } = await request;
  if (error) throw new Error("Não foi possível carregar os saldos de estoque.");
  return { rows: (data ?? []).map((row) => ({ productId: String(row.product_id), sku: String(row.sku), name: String(row.name), categoryName: row.category_name ? String(row.category_name) : null, unitCode: row.unit_code ? String(row.unit_code) : null, onHand: Number(row.quantity_on_hand ?? 0), reserved: Number(row.quantity_reserved ?? 0), available: Number(row.quantity_available ?? 0), minimum: Number(row.minimum_stock ?? 0), status: String(row.stock_status ?? "normal"), active: Boolean(row.active) })), count: count ?? 0, page: query.page, pageSize: PAGE_SIZE };
}

async function movementLookups(organizationId: string) {
  const supabase = await createClient();
  const [{ data: products }, { data: warehouses }] = await Promise.all([
    supabase.from("products").select("id, name").eq("organization_id", organizationId),
    supabase.from("warehouses").select("id, name").eq("organization_id", organizationId),
  ]);
  return { products: new Map((products ?? []).map((row) => [String(row.id), String(row.name)])), warehouses: new Map((warehouses ?? []).map((row) => [String(row.id), String(row.name)])) };
}

export async function listMovements(query: ListQuery): Promise<PageResult<MovementRow>> {
  const member = await requireOrganizationMember();
  const supabase = await createClient();
  const { from, to } = pageRange(query.page);
  let request = supabase.from("stock_movements").select("id, product_id, warehouse_id, movement_type, quantity_delta, unit_cost, notes, occurred_at, reversal_of_id", { count: "exact" }).eq("organization_id", member.organizationId).order("occurred_at", { ascending: false }).range(from, to);
  if (query.warehouse && zUuid(query.warehouse)) request = request.eq("warehouse_id", query.warehouse);
  if (query.product && zUuid(query.product)) request = request.eq("product_id", query.product);
  if (query.type) request = request.eq("movement_type", query.type);
  const [{ data, error, count }, lookups] = await Promise.all([request, movementLookups(member.organizationId)]);
  if (error) throw new Error("Não foi possível carregar as movimentações.");
  return { rows: (data ?? []).map((row) => ({ id: String(row.id), productId: String(row.product_id), productName: lookups.products.get(String(row.product_id)) ?? "Produto", warehouseId: String(row.warehouse_id), warehouseName: lookups.warehouses.get(String(row.warehouse_id)) ?? "Depósito", type: String(row.movement_type), quantity: Number(row.quantity_delta), unitCost: row.unit_cost === null ? null : Number(row.unit_cost), notes: row.notes ? String(row.notes) : null, occurredAt: String(row.occurred_at), reversalOfId: row.reversal_of_id ? String(row.reversal_of_id) : null })), count: count ?? 0, page: query.page, pageSize: PAGE_SIZE };
}

function zUuid(value: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }

export async function getMovement(id: string): Promise<MovementRow | null> {
  const result = await listMovements({ page: 1, product: undefined, warehouse: undefined, type: undefined, q: undefined, status: undefined });
  const inFirstPage = result.rows.find((row) => row.id === id);
  if (inFirstPage) return inFirstPage;
  const member = await requireOrganizationMember();
  const supabase = await createClient();
  const { data, error } = await supabase.from("stock_movements").select("id, product_id, warehouse_id, movement_type, quantity_delta, unit_cost, notes, occurred_at, reversal_of_id").eq("organization_id", member.organizationId).eq("id", id).maybeSingle();
  if (error) throw new Error("Não foi possível carregar a movimentação.");
  if (!data) return null;
  const lookups = await movementLookups(member.organizationId);
  return { id: String(data.id), productId: String(data.product_id), productName: lookups.products.get(String(data.product_id)) ?? "Produto", warehouseId: String(data.warehouse_id), warehouseName: lookups.warehouses.get(String(data.warehouse_id)) ?? "Depósito", type: String(data.movement_type), quantity: Number(data.quantity_delta), unitCost: data.unit_cost === null ? null : Number(data.unit_cost), notes: data.notes ? String(data.notes) : null, occurredAt: String(data.occurred_at), reversalOfId: data.reversal_of_id ? String(data.reversal_of_id) : null };
}

export async function listWarehouses(): Promise<WarehouseRow[]> {
  const member = await requireOrganizationMember();
  const supabase = await createClient();
  const [{ data, error }, { data: branches }] = await Promise.all([
    supabase.from("warehouses").select("id, branch_id, code, name, active").eq("organization_id", member.organizationId).order("name"),
    supabase.from("branches").select("id, name").eq("organization_id", member.organizationId),
  ]);
  if (error) throw new Error("Não foi possível carregar os depósitos.");
  const branchNames = new Map((branches ?? []).map((row) => [String(row.id), String(row.name)]));
  return (data ?? []).map((row) => ({ id: String(row.id), branchId: row.branch_id ? String(row.branch_id) : null, branchName: row.branch_id ? branchNames.get(String(row.branch_id)) ?? null : null, code: String(row.code), name: String(row.name), active: Boolean(row.active) }));
}

export async function getInventoryOptions(): Promise<{ warehouses: SelectOption[]; products: SelectOption[] }> {
  const member = await requireOrganizationMember();
  const supabase = await createClient();
  const [{ data: warehouses, error: warehouseError }, { data: products, error: productError }] = await Promise.all([
    supabase.from("warehouses").select("id, name, code").eq("organization_id", member.organizationId).eq("active", true).order("name"),
    supabase.from("products").select("id, name, sku").eq("organization_id", member.organizationId).eq("active", true).eq("track_stock", true).order("name").limit(500),
  ]);
  if (warehouseError || productError) throw new Error("Não foi possível carregar as opções do estoque.");
  return { warehouses: (warehouses ?? []).map((row) => ({ value: String(row.id), label: `${String(row.code)} — ${String(row.name)}` })), products: (products ?? []).map((row) => ({ value: String(row.id), label: `${String(row.sku)} — ${String(row.name)}` })) };
}

export async function getErpDashboard() {
  const member = await requireOrganizationMember();
  const supabase = await createClient();
  const [{ count: products }, { count: customers }, { count: suppliers }, { data: stock }] = await Promise.all([
    supabase.from("products").select("id", { count: "exact", head: true }).eq("organization_id", member.organizationId).eq("active", true),
    supabase.from("customers").select("id", { count: "exact", head: true }).eq("organization_id", member.organizationId).eq("active", true),
    supabase.from("suppliers").select("id", { count: "exact", head: true }).eq("organization_id", member.organizationId).eq("active", true),
    supabase.from("inventory_overview").select("stock_status, quantity_on_hand").eq("organization_id", member.organizationId),
  ]);
  const lowStock = (stock ?? []).filter((row) => row.stock_status === "low" || row.stock_status === "out").length;
  const totalUnits = (stock ?? []).reduce((sum, row) => sum + Number(row.quantity_on_hand ?? 0), 0);
  return { products: products ?? 0, customers: customers ?? 0, suppliers: suppliers ?? 0, lowStock, totalUnits };
}
