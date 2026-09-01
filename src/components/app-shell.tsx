import Link from "next/link";
import type { ReactNode } from "react";
import { FiArchive, FiBriefcase, FiFileText, FiGrid, FiLogIn, FiLogOut, FiPackage, FiSettings, FiShoppingBag, FiTruck, FiUsers } from "react-icons/fi";
import { logoutAction } from "@/app/auth/actions";
import { getAuthorizationContext, type MemberRole } from "@/lib/auth/authorization";
import { getErpModules } from "@/lib/erp/organization/queries";

export type AppSection = "dashboard" | "orders" | "products" | "categories" | "inventory" | "movements" | "warehouses" | "customers" | "suppliers" | "finance" | "fiscal" | "settings";

type AppShellProps = {
  active: AppSection;
  eyebrow: string;
  title: string;
  actions?: ReactNode;
  children: ReactNode;
};

const roleLabels: Record<MemberRole, string> = { admin: "Administrador", manager: "Gestor", operator: "Operador" };

export async function AppShell({ active, eyebrow, title, actions, children }: AppShellProps) {
  const { user, member } = await getAuthorizationContext();
  const modules = member ? await getErpModules() : [];
  const enabled = (code: string) => code === "core" || code === "catalog" || modules.some((module) => module.code === code && module.enabled);
  const initials = member?.organizationName.split(" ").map((part) => part[0]).slice(0, 2).join("").toUpperCase() ?? "BR";

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <Link className="brand" href="/" aria-label="Bridge ERP"><span className="brand-mark">B</span><span>Bridge ERP</span></Link>
        <nav className="nav-list" aria-label="Navegação principal">
          <ErpLink active={active} section="dashboard" href="/" icon={FiGrid}>Painel ERP</ErpLink>
          <ErpLink active={active} section="orders" href="/pedidos" icon={FiShoppingBag}>Vendas ZapNFe</ErpLink>

          <span className="nav-group-label">Cadastros</span>
          <ErpLink active={active} section="products" href="/produtos" icon={FiPackage}>Produtos</ErpLink>
          <ErpLink active={active} section="categories" href="/categorias" icon={FiArchive}>Categorias</ErpLink>
          <ErpLink active={active} section="customers" href="/clientes" icon={FiUsers}>Clientes</ErpLink>
          <ErpLink active={active} section="suppliers" href="/fornecedores" icon={FiTruck}>Fornecedores</ErpLink>

          {enabled("inventory") ? <>
            <span className="nav-group-label">Estoque</span>
            <ErpLink active={active} section="inventory" href="/estoque" icon={FiArchive}>Saldos</ErpLink>
            <ErpLink active={active} section="movements" href="/estoque/movimentacoes" icon={FiShoppingBag}>Movimentações</ErpLink>
            <ErpLink active={active} section="warehouses" href="/estoque/depositos" icon={FiBriefcase}>Depósitos</ErpLink>
          </> : null}

          {enabled("finance") ? <ErpLink active={active} section="finance" href="/financeiro" icon={FiGrid}>Financeiro</ErpLink> : null}
          {enabled("fiscal") ? <ErpLink active={active} section="fiscal" href="/fiscal" icon={FiFileText}>Fiscal</ErpLink> : null}
        </nav>
        <div className="sidebar-bottom">
          {member?.role === "admin" ? <Link className={`nav-item ${active === "settings" ? "active" : ""}`} href="/configuracoes/empresa"><FiSettings /><span>Configurações</span></Link> : null}
          {user ? <form action={logoutAction} className="nav-form"><button className="nav-item" type="submit"><FiLogOut /><span>Sair</span></button></form> : <Link className="nav-item" href="/login"><FiLogIn /><span>Entrar</span></Link>}
          <div className="company-card"><span className="company-avatar">{initials}</span><span><strong>{member?.organizationName ?? (user?.email || "Visitante")}</strong><small>{member ? roleLabels[member.role] : user ? "Sem vínculo ativo" : "Acesso público"}</small></span></div>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1></div>
          {actions ? <div className="top-actions">{actions}</div> : null}
        </header>
        {children}
        <LegalFooter />
      </section>
    </main>
  );
}

function ErpLink({ active, section, href, icon: Icon, children }: { active: AppSection; section: AppSection; href: string; icon: typeof FiGrid; children: ReactNode }) {
  return <Link className={`nav-item ${active === section ? "active" : ""}`} href={href} aria-current={active === section ? "page" : undefined}><Icon aria-hidden="true" /><span>{children}</span></Link>;
}

function LegalFooter() {
  return (
    <footer className="legal-footer">
      <span>Bridge ERP · Operação protegida por organização</span>
      <nav><Link href="/privacidade">Privacidade</Link><Link href="/termos">Termos</Link><Link href="/exclusao-de-dados">Exclusão de dados</Link></nav>
    </footer>
  );
}
