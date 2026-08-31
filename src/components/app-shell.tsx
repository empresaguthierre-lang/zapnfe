import Link from "next/link";
import type { ReactNode } from "react";
import { FiFileText, FiGrid, FiLogIn, FiLogOut, FiPackage, FiSettings, FiShoppingBag, FiUsers } from "react-icons/fi";
import { logoutAction } from "@/app/auth/actions";
import { getAuthorizationContext, type MemberRole } from "@/lib/auth/authorization";

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

const roleLabels: Record<MemberRole, string> = { admin: "Administrador", manager: "Gestor", operator: "Operador" };

export async function AppShell({ active, eyebrow, title, actions, children }: AppShellProps) {
  const { user, member } = await getAuthorizationContext();
  const initials = member?.organizationName.split(" ").map((part) => part[0]).slice(0, 2).join("").toUpperCase() ?? "ZA";

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
          {member?.role === "admin" ? <Link className={`nav-item ${active === "settings" ? "active" : ""}`} href="/configuracoes"><FiSettings /><span>Configurações</span></Link> : null}
          {user ? <form action={logoutAction} className="nav-form"><button className="nav-item" type="submit"><FiLogOut /><span>Sair</span></button></form> : <Link className="nav-item" href="/login"><FiLogIn /><span>Entrar</span></Link>}
          <div className="company-card"><span className="company-avatar">{initials}</span><span><strong>{member?.organizationName ?? (user?.email || "Zapala Atacado")}</strong><small>{member ? roleLabels[member.role] : user ? "Sem vínculo ativo" : "Dados demonstrativos"}</small></span></div>
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
