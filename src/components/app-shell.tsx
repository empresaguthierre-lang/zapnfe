import Link from "next/link";
import type { ReactNode } from "react";
import { FiFileText, FiGrid, FiPackage, FiSettings, FiShoppingBag, FiUsers } from "react-icons/fi";

export type AppSection = "dashboard" | "orders" | "customers" | "products" | "invoices" | "settings";

const navigation = [
  { key: "dashboard", label: "Visão geral", href: "/", icon: FiGrid },
  { key: "orders", label: "Pedidos", href: "/pedidos", icon: FiShoppingBag },
  { key: "customers", label: "Clientes", href: "/clientes", icon: FiUsers },
  { key: "products", label: "Produtos", href: "/produtos", icon: FiPackage },
  { key: "invoices", label: "Notas fiscais", href: "/notas-fiscais", icon: FiFileText },
] satisfies Array<{ key: AppSection; label: string; href: string; icon: typeof FiGrid }>;

type AppShellProps = {
  active: AppSection;
  eyebrow: string;
  title: string;
  actions?: ReactNode;
  children: ReactNode;
};

export function AppShell({ active, eyebrow, title, actions, children }: AppShellProps) {
  return (
    <main className="app-shell">
      <aside className="sidebar">
        <Link className="brand" href="/" aria-label="ZapNFe — visão geral"><span className="brand-mark">Z</span><span>ZapNFe</span></Link>
        <nav className="nav-list" aria-label="Navegação principal">
          {navigation.map(({ key, label, href, icon: Icon }) => (
            <Link className={`nav-item ${active === key ? "active" : ""}`} href={href} key={key} aria-current={active === key ? "page" : undefined}>
              <Icon aria-hidden="true" /><span>{label}</span>
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <Link className={`nav-item ${active === "settings" ? "active" : ""}`} href="/configuracoes"><FiSettings /><span>Configurações</span></Link>
          <div className="company-card"><span className="company-avatar">ZA</span><span><strong>Zapala Atacado</strong><small>Dados demonstrativos</small></span></div>
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

function LegalFooter() {
  return (
    <footer className="legal-footer">
      <span>ZapNFe · Ambiente de demonstração</span>
      <nav><Link href="/privacidade">Privacidade</Link><Link href="/termos">Termos</Link><Link href="/exclusao-de-dados">Exclusão de dados</Link></nav>
    </footer>
  );
}
