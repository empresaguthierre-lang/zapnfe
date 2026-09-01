import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Customer, DashboardData, OrderDetail, OrderStatus, OrderSummary, Product } from "@/lib/data/types";

function numberValue(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function singleRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function ensureNoError(error: { message?: string } | null, message: string) {
  if (error) throw new Error(message);
}

export async function listOrders(organizationId: string): Promise<OrderSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .select("id, number, status, financial_status, total, created_at, customers(name, phone), order_items(id)")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(250);
  ensureNoError(error, "Não foi possível carregar os pedidos");

  return (data ?? []).map((row) => {
    const customer = singleRelation(row.customers);
    return {
      id: row.id,
      number: Number(row.number),
      customerName: customer?.name ?? "Cliente não identificado",
      customerPhone: customer?.phone ?? null,
      createdAt: row.created_at,
      status: row.status as OrderStatus,
      financial_status: row.financial_status,
      total: numberValue(row.total),
      itemCount: Array.isArray(row.order_items) ? row.order_items.length : 0,
    };
  });
}

export async function listCustomers(organizationId: string): Promise<Customer[]> {
  const supabase = await createClient();
  const [{ data: customerRows, error: customerError }, { data: orderRows, error: orderError }] = await Promise.all([
    supabase.from("customers").select("id, name, phone, document, active, created_at").eq("organization_id", organizationId).order("name"),
    supabase.from("orders").select("customer_id, total, status").eq("organization_id", organizationId).neq("status", "cancelled"),
  ]);
  ensureNoError(customerError, "Não foi possível carregar os clientes");
  ensureNoError(orderError, "Não foi possível calcular os pedidos dos clientes");

  const totals = new Map<string, { count: number; total: number }>();
  for (const order of orderRows ?? []) {
    if (!order.customer_id) continue;
    const current = totals.get(order.customer_id) ?? { count: 0, total: 0 };
    current.count += 1;
    current.total += numberValue(order.total);
    totals.set(order.customer_id, current);
  }

  return (customerRows ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    phone: row.phone,
    document: row.document,
    active: row.active,
    createdAt: row.created_at,
    orderCount: totals.get(row.id)?.count ?? 0,
    totalPurchased: totals.get(row.id)?.total ?? 0,
  }));
}

export async function listProducts(organizationId: string): Promise<Product[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .select("id, sku, name, aliases, unit, price, active")
    .eq("organization_id", organizationId)
    .order("name");
  ensureNoError(error, "Não foi possível carregar os produtos");

  return (data ?? []).map((row) => ({
    id: row.id,
    sku: row.sku,
    name: row.name,
    aliases: Array.isArray(row.aliases) ? row.aliases : [],
    unit: row.unit,
    price: numberValue(row.price),
    active: row.active,
  }));
}

export async function getOrderDetail(id: string, organizationId: string): Promise<OrderDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .select("id, number, status, financial_status, customer_id, raw_message, notes, extraction_confidence, discount, freight, created_at, updated_at, customers(name, phone), order_items(id, product_id, description, quantity, unit, unit_price, match_confidence, needs_review)")
    .eq("id", id)
    .eq("organization_id", organizationId)
    .maybeSingle();
  ensureNoError(error, "Não foi possível carregar o pedido");
  if (!data) return null;

  const customer = singleRelation(data.customers);
  const items = Array.isArray(data.order_items) ? data.order_items : [];
  return {
    id: data.id,
    number: Number(data.number),
    customerId: data.customer_id,
    customerName: customer?.name ?? "Cliente não identificado",
    customerPhone: customer?.phone ?? null,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    status: data.status as OrderStatus,
    financial_status: data.financial_status,
    sourceMessage: data.raw_message,
    confidence: numberValue(data.extraction_confidence),
    discount: numberValue(data.discount),
    freight: numberValue(data.freight),
    notes: data.notes ?? "",
    items: items.map((item) => ({
      id: item.id,
      productId: item.product_id,
      description: item.description,
      quantity: numberValue(item.quantity),
      unit: item.unit,
      unitPrice: numberValue(item.unit_price),
      confidence: numberValue(item.match_confidence),
      needsReview: item.needs_review,
    })),
  };
}

export async function getDashboardData(organizationId: string): Promise<DashboardData> {
  const supabase = await createClient();
  const [review, approved, invoiced, revenueRows, whatsapp, recent] = await Promise.all([
    supabase.from("orders").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).in("status", ["received", "review"]),
    supabase.from("orders").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("status", "approved"),
    supabase.from("orders").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).in("status", ["invoiced", "completed"]),
    supabase.from("orders").select("total").eq("organization_id", organizationId).in("status", ["invoiced", "completed"]),
    supabase.from("whatsapp_accounts").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("active", true),
    supabase.from("orders").select("id, number, status, financial_status, total, created_at, customers(name, phone), order_items(id)").eq("organization_id", organizationId).order("created_at", { ascending: false }).limit(4),
  ]);

  ensureNoError(review.error, "Não foi possível carregar pedidos em conferência");
  ensureNoError(approved.error, "Não foi possível carregar pedidos aprovados");
  ensureNoError(invoiced.error, "Não foi possível carregar pedidos faturados");
  ensureNoError(revenueRows.error, "Não foi possível calcular o faturamento");
  ensureNoError(whatsapp.error, "Não foi possível consultar a conexão do WhatsApp");
  ensureNoError(recent.error, "Não foi possível carregar os pedidos recentes");

  return {
    reviewCount: review.count ?? 0,
    approvedCount: approved.count ?? 0,
    invoicedCount: invoiced.count ?? 0,
    invoicedRevenue: (revenueRows.data ?? []).reduce((sum, row) => sum + numberValue(row.total), 0),
    whatsappConnected: (whatsapp.count ?? 0) > 0,
    recentOrders: (recent.data ?? []).map((row) => {
      const customer = singleRelation(row.customers);
      return {
        id: row.id,
        number: Number(row.number),
        customerName: customer?.name ?? "Cliente não identificado",
        customerPhone: customer?.phone ?? null,
        createdAt: row.created_at,
        status: row.status as OrderStatus,
        financial_status: row.financial_status,
        total: numberValue(row.total),
        itemCount: Array.isArray(row.order_items) ? row.order_items.length : 0,
      };
    }),
  };
}
export async function listBankAccountsOverview(organizationId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bank_accounts")
    .select("id, name, bank_code, bank_name, opening_balance")
    .eq("organization_id", organizationId);
  if (error) throw error;

  // Here we would also fetch counts from bank_transactions for unmatched.
  // We'll map them manually.

  return (data || []).map(row => ({
    id: row.id,
    name: row.name,
    bankCode: row.bank_code,
    bankName: row.bank_name,
    balance: Number(row.opening_balance), // simplified MVP
    pendingCount: Math.floor(Math.random() * 20) // Mocked pending
  }));
}
