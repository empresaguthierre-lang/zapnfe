import Link from "next/link";
import type { ReactNode } from "react";
import { FiArchive, FiBriefcase, FiFileText, FiGrid, FiLogIn, FiLogOut, FiPackage, FiSettings, FiShoppingBag, FiTruck, FiUsers } from "react-icons/fi";
import { logoutAction } from "@/app/auth/actions";
import { getAuthorizationContext, type MemberRole } from "@/lib/auth/authorization";
import { getErpModules } from "@/lib/erp/organization/queries";

export type AppSection = "dashboard" | "orders" | "customers" | "products" | "invoices" | "settings" | "erp" | "erp-products" | "erp-categories" | "erp-inventory" | "erp-movements" | "erp-warehouses" | "erp-customers" | "erp-suppliers" | "erp-finance" | "erp-fiscal" | "erp-settings";

const navigation = [
  { key: "dashboard", label: "Visão geral", href: "/", icon: FiGrid },
  { key: "orders", label: "Pedidos", href: "/pedidos", icon: FiShoppingBag },
  { key: "customers", label: "Clientes", href: "/clientes", icon: FiUsers },
  { key: "products", label: "Produtos", href: "/produtos", icon: FiPackage },
  { key: "invoices", label: "Notas fiscais", href: "/notas-fiscais", icon: FiFileText },
  { key: "erp", label: "ERP", href: "/erp", icon: FiBriefcase },
] satisfies Array<{ key: AppSection; label: string; href: string; icon: typeof FiGrid }>;

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
  const erpMode = active === "erp" || active.startsWith("erp-");
  const modules = erpMode && member ? await getErpModules() : [];
  const enabled = (code: string) => code === "core" || code === "catalog" || modules.some((module) => module.code === code && module.enabled);
  const initials = member?.organizationName.split(" ").map((part) => part[0]).slice(0, 2).join("").toUpperCase() ?? "ZA";

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <Link className="brand" href="/" aria-label="ZapNFe — visão geral"><span className="brand-mark">Z</span><span>ZapNFe</span></Link>
        <nav className="nav-list" aria-label="Navegação principal">
          {(erpMode ? [{ key: "dashboard" as AppSection, label: "Voltar ao ZapNFe", href: "/", icon: FiShoppingBag }, { key: "erp" as AppSection, label: "Painel ERP", href: "/erp", icon: FiGrid }] : navigation).map(({ key, label, href, icon: Icon }) => (
            <Link className={`nav-item ${active === key ? "active" : ""}`} href={href} key={key} aria-current={active === key ? "page" : undefined}>
              <Icon aria-hidden="true" /><span>{label}</span>
            </Link>
          ))}
          {erpMode ? <>
            <span className="nav-group-label">Cadastros</span>
            <ErpLink active={active} section="erp-products" href="/erp/produtos" icon={FiPackage}>Produtos</ErpLink>
            <ErpLink active={active} section="erp-categories" href="/erp/categorias" icon={FiArchive}>Categorias</ErpLink>
            <ErpLink active={active} section="erp-customers" href="/erp/clientes" icon={FiUsers}>Clientes</ErpLink>
            <ErpLink active={active} section="erp-suppliers" href="/erp/fornecedores" icon={FiTruck}>Fornecedores</ErpLink>
            {enabled("inventory") ? <><span className="nav-group-label">Estoque</span><ErpLink active={active} section="erp-inventory" href="/erp/estoque" icon={FiArchive}>Saldos</ErpLink><ErpLink active={active} section="erp-movements" href="/erp/estoque/movimentacoes" icon={FiShoppingBag}>Movimentações</ErpLink><ErpLink active={active} section="erp-warehouses" href="/erp/estoque/depositos" icon={FiBriefcase}>Depósitos</ErpLink></> : null}
            {enabled("finance") ? <ErpLink active={active} section="erp-finance" href="/erp/financeiro" icon={FiGrid}>Financeiro</ErpLink> : null}
            {enabled("fiscal") ? <ErpLink active={active} section="erp-fiscal" href="/erp/fiscal" icon={FiFileText}>Fiscal</ErpLink> : null}
          </> : null}
        </nav>
        <div className="sidebar-bottom">
          {member?.role === "admin" ? <Link className={`nav-item ${active === "settings" || active === "erp-settings" ? "active" : ""}`} href={erpMode ? "/erp/configuracoes/empresa" : "/configuracoes"}><FiSettings /><span>Configurações</span></Link> : null}
          {user ? <form action={logoutAction} className="nav-form"><button className="nav-item" type="submit"><FiLogOut /><span>Sair</span></button></form> : <Link className="nav-item" href="/login"><FiLogIn /><span>Entrar</span></Link>}
          <div className="company-card"><span className="company-avatar">{initials}</span><span><strong>{member?.organizationName ?? (user?.email || "Zapala Atacado")}</strong><small>{member ? roleLabels[member.role] : user ? "Sem vínculo ativo" : "Acesso público"}</small></span></div>
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
      <span>ZapNFe · Operação protegida por organização</span>
      <nav><Link href="/privacidade">Privacidade</Link><Link href="/termos">Termos</Link><Link href="/exclusao-de-dados">Exclusão de dados</Link></nav>
    </footer>
  );
}
