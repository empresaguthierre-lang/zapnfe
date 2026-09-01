import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { requireOrganizationMember } from "@/lib/auth/authorization";
import { createClient } from "@/lib/supabase/server";

export type ErpModule = { id: string; code: string; name: string; description: string | null; isCore: boolean; enabled: boolean };
export type Branch = { id: string; code: string; name: string; tradeName: string | null; document: string | null; email: string | null; phone: string | null; isHeadquarters: boolean; active: boolean };

const alwaysAvailableModules = new Set(["core", "catalog"]);

export const getErpModules = cache(async (): Promise<ErpModule[]> => {
  const member = await requireOrganizationMember();
  const supabase = await createClient();
  const [{ data: modules, error: modulesError }, { data: enabledRows, error: enabledError }] = await Promise.all([
    supabase.from("erp_modules").select("id, code, name, description, is_core").eq("active", true).order("name"),
    supabase.from("organization_modules").select("module_id, enabled").eq("organization_id", member.organizationId),
  ]);
  if (modulesError || enabledError) throw new Error("Não foi possível carregar os módulos do ERP.");
  const enabledById = new Map((enabledRows ?? []).map((row) => [String(row.module_id), Boolean(row.enabled)]));
  return (modules ?? []).map((row) => ({
    id: String(row.id), code: String(row.code), name: String(row.name), description: row.description ? String(row.description) : null,
    isCore: Boolean(row.is_core), enabled: Boolean(row.is_core) || alwaysAvailableModules.has(String(row.code)) || enabledById.get(String(row.id)) === true,
  }));
});

export async function requireErpModule(code: string) {
  if (alwaysAvailableModules.has(code)) return;
  const modules = await getErpModules();
  if (!modules.some((module) => module.code === code && module.enabled)) redirect("/erp?modulo=indisponivel");
}

export async function listBranches(): Promise<Branch[]> {
  const member = await requireOrganizationMember();
  const supabase = await createClient();
  const { data, error } = await supabase.from("branches").select("id, code, name, trade_name, document, email, phone, is_headquarters, active").eq("organization_id", member.organizationId).order("is_headquarters", { ascending: false }).order("name");
  if (error) throw new Error("Não foi possível carregar as filiais.");
  return (data ?? []).map((row) => ({ id: String(row.id), code: String(row.code), name: String(row.name), tradeName: row.trade_name ? String(row.trade_name) : null, document: row.document ? String(row.document) : null, email: row.email ? String(row.email) : null, phone: row.phone ? String(row.phone) : null, isHeadquarters: Boolean(row.is_headquarters), active: Boolean(row.active) }));
}

export async function getOrganizationSummary() {
  const member = await requireOrganizationMember();
  const supabase = await createClient();
  const { data, error } = await supabase.from("organizations").select("id, name, active, created_at").eq("id", member.organizationId).single();
  if (error) throw new Error("Não foi possível carregar a empresa.");
  return { id: String(data.id), name: String(data.name), active: Boolean(data.active), createdAt: String(data.created_at) };
}
