"use server";

import { revalidatePath } from "next/cache";
import { saveBranch, setOrganizationModule } from "@/lib/erp/organization/mutations";
import type { ActionResult } from "@/lib/erp/shared/types";

export async function saveBranchAction(_state: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const result = await saveBranch({ id: read(formData, "id") || undefined, code: read(formData, "code"), name: read(formData, "name"), tradeName: read(formData, "tradeName"), document: read(formData, "document"), email: read(formData, "email"), phone: read(formData, "phone"), isHeadquarters: formData.get("isHeadquarters") === "on", active: formData.get("active") === "on" });
  if (result.ok) revalidatePath("/configuracoes/filiais");
  return result;
}

export async function setModuleAction(_state: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const result = await setOrganizationModule({ moduleId: read(formData, "moduleId"), enabled: read(formData, "enabled") === "true" });
  if (result.ok) { revalidatePath("/", "layout"); revalidatePath("/configuracoes/modulos"); }
  return result;
}

function read(formData: FormData, key: string) { const value = formData.get(key); return typeof value === "string" ? value : ""; }

