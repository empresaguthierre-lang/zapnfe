import Link from "next/link";
import { FiAlertTriangle, FiBox, FiPackage, FiTruck, FiUsers } from "react-icons/fi";
import { AppShell } from "@/components/app-shell";
import { requireOrganizationMember } from "@/lib/auth/authorization";
import { getErpDashboard } from "@/lib/erp/inventory/queries";

export const dynamic = "force-dynamic";

export default async function ErpDashboardPage({ searchParams }: { searchParams: Promise<{ modulo?: string }> }) {
  const member = await requireOrganizationMember(); const metrics = await getErpDashboard(); const params = await searchParams;
  return <AppShell active="dashboard" eyebrow="Gestão integrada" title="Painel ERP" actions={<Link className="primary-button" href="/produtos/novo">Novo produto</Link>}>
    {params.modulo === "indisponivel" ? <div className="erp-alert"><FiAlertTriangle /> Este módulo está desativado para a organização.</div> : null}
    <section className="erp-welcome panel"><div><p className="eyebrow">{member.organizationName}</p><h2>A operação em uma base única</h2><p>Cadastros, estoque e pedidos compartilham a mesma organização, com permissões e trilha de movimentações.</p></div><div className="erp-quick-links"><Link href="/produtos">Catálogo</Link><Link href="/estoque">Estoque</Link><Link href="/pedidos">Pedidos Bridge ERP</Link></div></section>
    <section className="erp-metrics"><article className="panel"><FiPackage /><span>Produtos ativos</span><strong>{metrics.products}</strong></article><article className="panel"><FiUsers /><span>Clientes ativos</span><strong>{metrics.customers}</strong></article><article className="panel"><FiTruck /><span>Fornecedores</span><strong>{metrics.suppliers}</strong></article><article className="panel"><FiAlertTriangle /><span>Estoque crítico</span><strong>{metrics.lowStock}</strong></article><article className="panel"><FiBox /><span>Unidades em estoque</span><strong>{metrics.totalUnits.toLocaleString("pt-BR")}</strong></article></section>
    <section className="erp-roadmap panel"><div><p className="eyebrow">Primeiro núcleo</p><h3>ERP modular + automação Bridge ERP</h3></div><ol><li className="done">Cadastros e organização</li><li className="done">Livro e saldos de estoque</li><li>Compras e fornecedores</li><li>Financeiro e fiscal</li></ol></section>
  </AppShell>;
}

