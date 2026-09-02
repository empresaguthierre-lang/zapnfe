import Link from "next/link";
import type { ReactNode } from "react";
import { FiLogIn, FiLogOut } from "react-icons/fi";
import { logoutAction } from "@/app/auth/actions";
import { ModularSidebar } from "@/components/modular-sidebar";
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

export async function AppShell({ eyebrow, title, actions, children }: AppShellProps) {
  const { user, member } = await getAuthorizationContext();
  const modules = member ? await getErpModules() : [];
  const enabled = (code: string) => code === "core" || code === "catalog" || modules.some((module) => module.code === code && module.enabled);
  const initials = member?.organizationName.split(" ").map((part) => part[0]).slice(0, 2).join("").toUpperCase() ?? "BR";

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <Link className="brand" href="/" aria-label="Bridge ERP"><span className="brand-mark">B</span><span>Bridge ERP</span></Link>
        <ModularSidebar
          enabledModules={{
            sales: true,
            inventory: enabled("inventory"),
            finance: enabled("finance"),
            fiscal: enabled("fiscal"),
          }}
          isAdmin={member?.role === "admin"}
        />
        <div className="sidebar-bottom">
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

function LegalFooter() {
  return (
    <footer className="legal-footer">
      <span>Bridge ERP · Operação protegida por organização</span>
      <nav><Link href="/privacidade">Privacidade</Link><Link href="/termos">Termos</Link><Link href="/exclusao-de-dados">Exclusão de dados</Link></nav>
    </footer>
  );
}
