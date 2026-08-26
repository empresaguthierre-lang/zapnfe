import Link from "next/link";
import { FiArrowUpRight, FiCheck, FiChevronRight, FiClock, FiFileText, FiMessageCircle, FiPackage, FiPlus, FiShoppingBag } from "react-icons/fi";
import { AppShell } from "@/components/app-shell";
import { StatusBadge } from "@/components/status-badge";
import { customerForOrder, formatCurrency, formatDateTime, orders, orderTotal } from "@/lib/demo-data";

export default function Home() {
  const reviewCount = orders.filter((order) => order.status === "review").length;
  const invoicedCount = orders.filter((order) => order.status === "invoiced" || order.status === "completed").length;
  const revenue = orders.filter((order) => order.status === "invoiced" || order.status === "completed").reduce((total, order) => total + orderTotal(order), 0);

  return (
    <AppShell active="dashboard" eyebrow="Operação demonstrativa" title="Visão geral" actions={<Link className="primary-button" href="/pedidos"><FiPlus /> Ver pedidos</Link>}>
      <section className="demo-banner" role="status"><FiClock /><span><strong>Modo demonstração:</strong> todas as telas funcionam com dados locais. Nenhuma mensagem será enviada e nenhuma NF-e será emitida.</span></section>
      <section className="hero-card">
        <div className="hero-copy">
          <span className="live-pill"><span /> Fluxo preparado</span>
          <h2>Construa toda a operação<br />antes de conectar a Meta.</h2>
          <p>Cadastre, confira e valide pedidos enquanto o novo número comercial é preparado.</p>
          <Link className="light-button" href="/pedidos"><FiShoppingBag /> Conferir pedidos <FiArrowUpRight /></Link>
        </div>
        <div className="flow-visual" aria-label="Fluxo WhatsApp, pedido e NF-e">
          <div className="flow-node pending"><FiMessageCircle /><span>WhatsApp</span><small>aguardando</small></div><FiChevronRight className="flow-arrow" />
          <div className="flow-node"><FiShoppingBag /><span>Pedido</span><small>pronto</small></div><FiChevronRight className="flow-arrow" />
          <div className="flow-node highlight"><FiFileText /><span>NF-e</span><small>homologação</small></div>
        </div>
      </section>
      <section className="metrics-grid" aria-label="Indicadores demonstrativos">
        <article className="metric-card"><span className="metric-icon blue"><FiShoppingBag /></span><div><p>Pedidos hoje</p><strong>{orders.length}</strong><small>dados demonstrativos</small></div></article>
        <article className="metric-card"><span className="metric-icon teal"><FiCheck /></span><div><p>Para conferir</p><strong>{reviewCount}</strong><small>itens ambíguos destacados</small></div></article>
        <article className="metric-card"><span className="metric-icon gold"><FiFileText /></span><div><p>Faturados</p><strong>{invoicedCount}</strong><small>{formatCurrency(revenue)}</small></div></article>
        <article className="metric-card"><span className="metric-icon pale"><FiClock /></span><div><p>Integrações ativas</p><strong>0 de 3</strong><small>Supabase, Meta e Focus</small></div></article>
      </section>
      <section className="content-grid">
        <article className="panel orders-panel">
          <div className="panel-header"><div><p className="eyebrow">Operação</p><h3>Pedidos recentes</h3></div><Link className="text-button" href="/pedidos">Ver todos <FiChevronRight /></Link></div>
          <div className="order-list">
            {orders.slice(0, 4).map((order) => {
              const customer = customerForOrder(order);
              return (
                <Link className="order-row" href={`/pedidos/${order.id}`} key={order.id}>
                  <span className="customer-avatar">{customer?.name.split(" ").map((part) => part[0]).slice(0, 2).join("")}</span>
                  <div className="customer-info"><strong>{customer?.name}</strong><small>Pedido #{order.number} · {formatDateTime(order.createdAt)}</small></div>
                  <strong className="order-total">{formatCurrency(orderTotal(order))}</strong><StatusBadge status={order.status} /><FiChevronRight className="row-chevron" />
                </Link>
              );
            })}
          </div>
        </article>
        <aside className="panel next-step">
          <div className="panel-header"><div><p className="eyebrow">Sprint 1</p><h3>O que podemos fazer agora</h3></div><span className="phase-badge">Sem chaves</span></div>
          <div className="timeline">
            <div className="timeline-item current"><span>1</span><div><strong>Catálogo e clientes</strong><small>Telas, filtros e validações prontas para persistência.</small></div></div>
            <div className="timeline-item current"><span>2</span><div><strong>Conferência do pedido</strong><small>Itens, quantidades, preços, desconto, frete e total.</small></div></div>
            <div className="timeline-item"><span>3</span><div><strong>Supabase</strong><small>Trocar fixtures pelo banco quando as chaves forem configuradas.</small></div></div>
            <div className="timeline-item"><span>4</span><div><strong>Meta e Focus</strong><small>Conectar somente em ambiente de homologação.</small></div></div>
          </div>
          <div className="setup-callout"><FiPackage /><div><strong>Sem trabalho perdido</strong><p>As telas usam os mesmos contratos de dados previstos no banco multiempresa.</p></div></div>
        </aside>
      </section>
    </AppShell>
  );
}
