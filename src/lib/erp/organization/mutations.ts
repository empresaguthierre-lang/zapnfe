import "server-only";

import { requireOrganizationRole } from "@/lib/auth/authorization";
import { createClient } from "@/lib/supabase/server";
import { databaseErrorMessage, type ActionResult } from "@/lib/erp/shared/types";
import { branchInputSchema, moduleInputSchema } from "./schemas";

export async function saveBranch(input: unknown): Promise<ActionResult> {
  const member = await requireOrganizationRole(["admin", "manager"]);
  const parsed = branchInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Revise os campos da filial.", fieldErrors: parsed.error.flatten().fieldErrors };
  const supabase = await createClient();
  const payload = { organization_id: member.organizationId, code: parsed.data.code, name: parsed.data.name, trade_name: parsed.data.tradeName || null, document: parsed.data.document || null, email: parsed.data.email || null, phone: parsed.data.phone || null, is_headquarters: parsed.data.isHeadquarters, active: parsed.data.active };
  const query = parsed.data.id
    ? supabase.from("branches").update(payload).eq("id", parsed.data.id).eq("organization_id", member.organizationId).select("id").single()
    : supabase.from("branches").insert(payload).select("id").single();
  const { data, error } = await query;
  if (error || !data) return { ok: false, message: databaseErrorMessage("salvar a filial") };
  return { ok: true, message: "Filial salva com sucesso.", id: String(data.id) };
}

export async function setOrganizationModule(input: unknown): Promise<ActionResult> {
  const member = await requireOrganizationRole(["admin"]);
  const parsed = moduleInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Configuração de módulo inválida." };
  const supabase = await createClient();
  const { data: moduleRow, error: moduleError } = await supabase.from("erp_modules").select("id, is_core").eq("id", parsed.data.moduleId).eq("active", true).maybeSingle();
  if (moduleError || !moduleRow) return { ok: false, message: "Módulo não encontrado." };
  if (moduleRow.is_core && !parsed.data.enabled) return { ok: false, message: "Módulos essenciais não podem ser desativados." };
  const now = new Date().toISOString();
  const { error } = await supabase.from("organization_modules").upsert({ organization_id: member.organizationId, module_id: parsed.data.moduleId, enabled: parsed.data.enabled, enabled_at: parsed.data.enabled ? now : null, disabled_at: parsed.data.enabled ? null : now }, { onConflict: "organization_id,module_id" });
  if (error) return { ok: false, message: databaseErrorMessage("atualizar o módulo") };
  return { ok: true, message: parsed.data.enabled ? "Módulo ativado." : "Módulo desativado." };
}
