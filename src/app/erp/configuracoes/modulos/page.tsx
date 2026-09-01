import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { ModuleManager } from "@/components/erp/module-manager";
import { requireOrganizationRole } from "@/lib/auth/authorization";
import { getErpModules } from "@/lib/erp/organization/queries";

export const dynamic = "force-dynamic";
export default async function ModulesPage() { await requireOrganizationRole(["admin"]); const modules = await getErpModules(); return <AppShell active="erp-settings" eyebrow="Configurações" title="Módulos"><nav className="erp-settings-tabs"><Link href="/erp/configuracoes/empresa">Empresa</Link><Link href="/erp/configuracoes/filiais">Filiais</Link><Link className="active" href="/erp/configuracoes/modulos">Módulos</Link></nav><ModuleManager modules={modules} /></AppShell>; }
