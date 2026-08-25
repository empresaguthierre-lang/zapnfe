import { FiArrowUpRight, FiBox, FiCheck, FiChevronRight, FiClock, FiFileText, FiGrid, FiMessageCircle, FiMoreHorizontal, FiPackage, FiPlus, FiSearch, FiSettings, FiShoppingBag, FiUsers } from "react-icons/fi";

const orders = [
  { customer: "Mercado São João", initials: "MS", items: "10 itens", total: "R$ 1.842,50", time: "há 3 min", status: "Conferência", tone: "review" },
  { customer: "Distribuidora Leste", initials: "DL", items: "6 itens", total: "R$ 780,30", time: "há 12 min", status: "Recebido", tone: "received" },
  { customer: "Comercial Açores", initials: "CA", items: "14 itens", total: "R$ 2.910,00", time: "há 28 min", status: "Faturado", tone: "invoiced" },
  { customer: "Atacadão do Vale", initials: "AV", items: "8 itens", total: "R$ 1.150,00", time: "há 45 min", status: "Finalizado", tone: "done" },
];

const menu = [
  { label: "Visão geral", icon: FiGrid, active: true },
  { label: "Pedidos", icon: FiShoppingBag },
  { label: "Clientes", icon: FiUsers },
  { label: "Produtos", icon: FiPackage },
  { label: "Notas fiscais", icon: FiFileText },
];

export default function Home() {
  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">Z</span><span>ZapNFe</span></div>
        <nav className="nav-list" aria-label="Navegação principal">
          {menu.map(({ label, icon: Icon, active }) => (
            <button className={`nav-item ${active ? "active" : ""}`} key={label} type="button"><Icon aria-hidden="true" /><span>{label}</span></button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button className="nav-item" type="button"><FiSettings /><span>Configurações</span></button>
          <div className="company-card"><span className="company-avatar">ZA</span><span><strong>Zapala Atacado</strong><small>Ambiente de teste</small></span><FiChevronRight /></div>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div><p className="eyebrow">Terça-feira, 25 de agosto</p><h1>Bom dia, Guthierre</h1></div>
          <div className="top-actions"><button className="icon-button" aria-label="Pesquisar"><FiSearch /></button><button className="primary-button"><FiPlus /> Novo pedido</button></div>
        </header>

        <section className="hero-card">
          <div className="hero-copy">
            <span className="live-pill"><span /> WhatsApp conectado</span>
            <h2>Do WhatsApp à nota fiscal,<br />sem redigitar pedidos.</h2>
            <p>Receba, confira e fature cada pedido em um único fluxo.</p>
            <button className="light-button" type="button"><FiMessageCircle /> Ver caixa de entrada <FiArrowUpRight /></button>
          </div>
          <div className="flow-visual" aria-label="Fluxo WhatsApp, pedido e NF-e">
            <div className="flow-node"><FiMessageCircle /><span>WhatsApp</span></div><FiChevronRight className="flow-arrow" />
            <div className="flow-node"><FiShoppingBag /><span>Pedido</span></div><FiChevronRight className="flow-arrow" />
            <div className="flow-node highlight"><FiFileText /><span>NF-e</span></div>
          </div>
        </section>

        <section className="metrics-grid" aria-label="Indicadores">
          <article className="metric-card"><span className="metric-icon blue"><FiMessageCircle /></span><div><p>Pedidos hoje</p><strong>24</strong><small><b>+18%</b> vs. ontem</small></div></article>
          <article className="metric-card"><span className="metric-icon teal"><FiCheck /></span><div><p>Para conferir</p><strong>7</strong><small>3 pedidos novos</small></div></article>
          <article className="metric-card"><span className="metric-icon gold"><FiFileText /></span><div><p>Notas emitidas</p><strong>15</strong><small>R$ 18.420,90</small></div></article>
          <article className="metric-card"><span className="metric-icon pale"><FiClock /></span><div><p>Tempo economizado</p><strong>2h 48min</strong><small>Estimativa de hoje</small></div></article>
        </section>

        <section className="content-grid">
          <article className="panel orders-panel">
            <div className="panel-header"><div><p className="eyebrow">Operação</p><h3>Pedidos recentes</h3></div><button className="text-button" type="button">Ver todos <FiChevronRight /></button></div>
            <div className="order-list">
              {orders.map((order) => (
                <div className="order-row" key={order.customer}>
                  <span className="customer-avatar">{order.initials}</span><div className="customer-info"><strong>{order.customer}</strong><small>{order.items} · {order.time}</small></div>
                  <strong className="order-total">{order.total}</strong><span className={`status ${order.tone}`}>{order.status}</span>
                  <button className="more-button" aria-label={`Opções de ${order.customer}`}><FiMoreHorizontal /></button>
                </div>
              ))}
            </div>
          </article>

          <aside className="panel next-step">
            <div className="panel-header"><div><p className="eyebrow">MVP</p><h3>Próximas etapas</h3></div><span className="phase-badge">Fase 1</span></div>
            <div className="timeline">
              <div className="timeline-item current"><span>1</span><div><strong>WhatsApp + Gemini</strong><small>Receber, interpretar e salvar pedidos</small></div></div>
              <div className="timeline-item"><span>2</span><div><strong>Focus NFe</strong><small>Aprovar, emitir e enviar o DANFE</small></div></div>
              <div className="timeline-item"><span>3</span><div><strong>Produtos + A1</strong><small>Cadastros e certificado digital</small></div></div>
            </div>
            <div className="setup-callout"><FiBox /><div><strong>Configuração pendente</strong><p>Conecte Supabase, WhatsApp, Gemini e Focus NFe quando os projetos estiverem disponíveis.</p></div></div>
          </aside>
        </section>
      </section>
    </main>
  );
}
