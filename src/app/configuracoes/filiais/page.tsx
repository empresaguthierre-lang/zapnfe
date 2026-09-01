import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { BranchManager } from "@/components/erp/branch-manager";
import { requireOrganizationRole } from "@/lib/auth/authorization";
import { listBranches } from "@/lib/erp/organization/queries";

export const dynamic = "force-dynamic";
export default async function BranchesPage() { await requireOrganizationRole(["admin"]); const branches = await listBranches(); return <AppShell active="settings" eyebrow="Configurações" title="Filiais"><nav className="erp-settings-tabs"><Link href="/configuracoes/empresa">Empresa</Link><Link className="active" href="/configuracoes/filiais">Filiais</Link><Link href="/configuracoes/modulos">Módulos</Link></nav><BranchManager branches={branches} /></AppShell>; }

