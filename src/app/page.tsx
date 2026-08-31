import Link from "next/link";
import { FiArrowUpRight, FiCheck, FiChevronRight, FiClock, FiFileText, FiMessageCircle, FiPackage, FiPlus, FiShoppingBag } from "react-icons/fi";
import { AppShell } from "@/components/app-shell";
import { StatusBadge } from "@/components/status-badge";
import { requireOrganizationMember } from "@/lib/auth/authorization";
import { formatCurrency, formatDateTime } from "@/lib/data/format";
import { getDashboardData } from "@/lib/data/operations";

export const dynamic = "force-dynamic";

function initials(name: string) {
  return name.split(" ").map((part) => part[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "CL";
}

export default async function Home() {
  const member = await requireOrganizationMember();
  const dashboard = await getDashboardData(member.organizationId);
  const integrationCount = 1 + (dashboard.whatsappConnected ? 1 : 0);

  return (
    <AppShell active="dashboard" eyebrow="Operação ao vivo" title="Visão geral" actions={<Link className="primary-button" href="/pedidos"><FiPlus /> Ver pedidos</Link>}>
      <section className="demo-banner live-data-banner" role="status"><FiCheck /><span><strong>Dados reais:</strong> esta visão está conectada ao Supabase da organização {member.organizationName}. As políticas RLS limitam a leitura ao vínculo autenticado.</span></section>
      <section className="hero-card">
        <div className="hero-copy">
          <span className="live-pill"><span /> Operação conectada</span>
          <h2>WhatsApp vira pedido.<br />Você confere antes de faturar.</h2>
          <p>A fila operacional agora lê pedidos, clientes e produtos persistidos no banco.</p>
          <Link className="light-button" href="/pedidos"><FiShoppingBag /> Conferir pedidos <FiArrowUpRight /></Link>
        </div>
        <div className="flow-visual" aria-label="Fluxo WhatsApp, pedido e NF-e">
          <div className={`flow-node ${dashboard.whatsappConnected ? "" : "pending"}`}><FiMessageCircle /><span>WhatsApp</span><small>{dashboard.whatsappConnected ? "conectado" : "aguardando"}</small></div><FiChevronRight className="flow-arrow" />
          <div className="flow-node"><FiShoppingBag /><span>Pedido</span><small>persistido</small></div><FiChevronRight className="flow-arrow" />
          <div className="flow-node highlight"><FiFileText /><span>NF-e</span><small>próxima etapa</small></div>
        </div>
      </section>
      <section className="metrics-grid" aria-label="Indicadores operacionais">
        <article className="metric-card"><span className="metric-icon blue"><FiShoppingBag /></span><div><p>Para conferir</p><strong>{dashboard.reviewCount}</strong><small>pedidos aguardando revisão</small></div></article>
        <article className="metric-card"><span className="metric-icon teal"><FiCheck /></span><div><p>Prontos para faturar</p><strong>{dashboard.approvedCount}</strong><small>conferência aprovada</small></div></article>
        <article className="metric-card"><span className="metric-icon gold"><FiFileText /></span><div><p>Faturados</p><strong>{dashboard.invoicedCount}</strong><small>{formatCurrency(dashboard.invoicedRevenue)}</small></div></article>
        <article className="metric-card"><span className="metric-icon pale"><FiClock /></span><div><p>Integrações ativas</p><strong>{integrationCount} de 3</strong><small>Supabase, Meta e Focus</small></div></article>
      </section>
      <section className="content-grid">
        <article className="panel orders-panel">
          <div className="panel-header"><div><p className="eyebrow">Operação</p><h3>Pedidos recentes</h3></div><Link className="text-button" href="/pedidos">Ver todos <FiChevronRight /></Link></div>
          <div className="order-list">
            {dashboard.recentOrders.map((order) => (
              <Link className="order-row" href={`/pedidos/${order.id}`} key={order.id}>
                <span className="customer-avatar">{initials(order.customerName)}</span>
                <div className="customer-info"><strong>{order.customerName}</strong><small>Pedido #{order.number} · {formatDateTime(order.createdAt)}</small></div>
                <strong className="order-total">{formatCurrency(order.total)}</strong><StatusBadge status={order.status} /><FiChevronRight className="row-chevron" />
              </Link>
            ))}
            {dashboard.recentOrders.length === 0 ? <div className="empty-state"><strong>Nenhum pedido recebido ainda</strong><p>Assim que uma mensagem válida virar pedido, ela aparecerá aqui.</p></div> : null}
          </div>
        </article>
        <aside className="panel next-step">
          <div className="panel-header"><div><p className="eyebrow">MVP operacional</p><h3>Fluxo atual</h3></div><span className="phase-badge">Persistência real</span></div>
          <div className="timeline">
            <div className="timeline-item current"><span>1</span><div><strong>Catálogo e clientes</strong><small>Lidos diretamente do Supabase da organização.</small></div></div>
            <div className="timeline-item current"><span>2</span><div><strong>Conferência do pedido</strong><small>Correções, totais e aprovação são persistidos.</small></div></div>
            <div className="timeline-item current"><span>3</span><div><strong>WhatsApp</strong><small>{dashboard.whatsappConnected ? "Conta ativa vinculada à empresa." : "Aguardando uma conta ativa da Meta."}</small></div></div>
            <div className="timeline-item"><span>4</span><div><strong>Focus NFe</strong><small>Emissão fiscal permanece separada até a homologação.</small></div></div>
          </div>
          <div className="setup-callout"><FiPackage /><div><strong>Próximo marco</strong><p>Consumir pedidos com status “Pronto para faturar” na integração fiscal de homologação.</p></div></div>
        </aside>
      </section>
    </AppShell>
  );
}
