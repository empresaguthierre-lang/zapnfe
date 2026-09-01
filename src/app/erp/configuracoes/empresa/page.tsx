import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { requireOrganizationRole } from "@/lib/auth/authorization";
import { getOrganizationSummary } from "@/lib/erp/organization/queries";

export const dynamic = "force-dynamic";
export default async function CompanyPage() { await requireOrganizationRole(["admin"]); const organization = await getOrganizationSummary(); return <AppShell active="erp-settings" eyebrow="Configurações" title="Empresa"><nav className="erp-settings-tabs"><Link className="active" href="/erp/configuracoes/empresa">Empresa</Link><Link href="/erp/configuracoes/filiais">Filiais</Link><Link href="/erp/configuracoes/modulos">Módulos</Link></nav><section className="panel erp-detail-grid"><div><span>Nome</span><strong>{organization.name}</strong></div><div><span>Identificador</span><strong>{organization.id}</strong></div><div><span>Status</span><strong>{organization.active ? "Ativa" : "Inativa"}</strong></div><div><span>Criada em</span><strong>{new Date(organization.createdAt).toLocaleDateString("pt-BR")}</strong></div></section></AppShell>; }
