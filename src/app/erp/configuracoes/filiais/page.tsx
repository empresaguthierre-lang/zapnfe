import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { BranchManager } from "@/components/erp/branch-manager";
import { requireOrganizationRole } from "@/lib/auth/authorization";
import { listBranches } from "@/lib/erp/organization/queries";

export const dynamic = "force-dynamic";
export default async function BranchesPage() { await requireOrganizationRole(["admin"]); const branches = await listBranches(); return <AppShell active="erp-settings" eyebrow="Configurações" title="Filiais"><nav className="erp-settings-tabs"><Link href="/erp/configuracoes/empresa">Empresa</Link><Link className="active" href="/erp/configuracoes/filiais">Filiais</Link><Link href="/erp/configuracoes/modulos">Módulos</Link></nav><BranchManager branches={branches} /></AppShell>; }
