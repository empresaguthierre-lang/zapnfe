"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { IconType } from "react-icons";
import {
  FiArchive,
  FiBookOpen,
  FiBox,
  FiBriefcase,
  FiChevronDown,
  FiCreditCard,
  FiDollarSign,
  FiFileText,
  FiGrid,
  FiLayers,
  FiPackage,
  FiRepeat,
  FiSettings,
  FiShoppingBag,
  FiTag,
  FiTruck,
  FiUsers,
} from "react-icons/fi";
import styles from "./modular-sidebar.module.css";

type ModuleCode = "sales" | "catalog" | "inventory" | "finance" | "fiscal" | "settings";

type SidebarItem = {
  label: string;
  href?: string;
  icon: IconType;
  comingSoon?: boolean;
};

type SidebarModule = {
  code: ModuleCode;
  label: string;
  icon: IconType;
  items: SidebarItem[];
};

type ModularSidebarProps = {
  enabledModules: {
    sales: boolean;
    inventory: boolean;
    finance: boolean;
    fiscal: boolean;
  };
  isAdmin: boolean;
};

const modules: SidebarModule[] = [
  {
    code: "sales",
    label: "Vendas",
    icon: FiShoppingBag,
    items: [{ label: "Pedidos Bridge ERP", href: "/pedidos", icon: FiShoppingBag }],
  },
  {
    code: "catalog",
    label: "Cadastros",
    icon: FiBookOpen,
    items: [
      { label: "Produtos", href: "/produtos", icon: FiPackage },
      { label: "Categorias", href: "/categorias", icon: FiTag },
      { label: "Clientes", href: "/clientes", icon: FiUsers },
      { label: "Fornecedores", href: "/fornecedores", icon: FiTruck },
    ],
  },
  {
    code: "inventory",
    label: "Estoque",
    icon: FiArchive,
    items: [
      { label: "Visão geral", href: "/estoque", icon: FiGrid },
      { label: "Movimentações", href: "/estoque/movimentacoes", icon: FiRepeat },
      { label: "Depósitos", href: "/estoque/depositos", icon: FiBriefcase },
    ],
  },
  {
    code: "finance",
    label: "Financeiro",
    icon: FiDollarSign,
    items: [
      { label: "Visão geral", href: "/financeiro", icon: FiGrid },
      { label: "Contas a receber", href: "/financeiro/receber", icon: FiCreditCard },
      { label: "Contas a pagar", icon: FiFileText, comingSoon: true },
      { label: "Bancos e caixas", href: "/financeiro/bancos", icon: FiBriefcase },
      { label: "Conciliação", icon: FiRepeat, comingSoon: true },
    ],
  },
  {
    code: "fiscal",
    label: "Fiscal",
    icon: FiFileText,
    items: [
      { label: "Visão geral", href: "/fiscal", icon: FiGrid },
      { label: "Notas fiscais", href: "/notas-fiscais", icon: FiFileText },
      { label: "Configuração fiscal", icon: FiSettings, comingSoon: true },
    ],
  },
  {
    code: "settings",
    label: "Configurações",
    icon: FiSettings,
    items: [
      { label: "Empresa", href: "/configuracoes/empresa", icon: FiBriefcase },
      { label: "Filiais", href: "/configuracoes/filiais", icon: FiLayers },
      { label: "Módulos", href: "/configuracoes/modulos", icon: FiBox },
    ],
  },
];

export function ModularSidebar({ enabledModules, isAdmin }: ModularSidebarProps) {
  const pathname = usePathname();
  const visibleModules = modules.filter((module) => {
    if (module.code === "catalog") return true;
    if (module.code === "settings") return isAdmin;
    return enabledModules[module.code];
  });

  return (
    <SidebarNavigation
      key={pathname}
      pathname={pathname}
      visibleModules={visibleModules}
    />
  );
}

function SidebarNavigation({ pathname, visibleModules }: { pathname: string; visibleModules: SidebarModule[] }) {
  const activeHref = findActiveHref(pathname, visibleModules);
  const activeModule = visibleModules.find((module) =>
    module.items.some((item) => item.href === activeHref),
  );
  const [openModule, setOpenModule] = useState<ModuleCode | null>(activeModule?.code ?? null);

  const mobileItems = [
    { label: "Painel", href: "/", icon: FiGrid },
    ...visibleModules
      .filter((module) => module.code !== "settings")
      .map((module) => {
        const firstItem = module.items.find((item) => item.href);
        if (!firstItem?.href) return null;
        const label = module.code === "sales" ? "Pedidos" : module.code === "catalog" ? "Produtos" : module.label;
        return { ...firstItem, label };
      })
      .filter((item): item is SidebarItem & { href: string } => Boolean(item)),
  ];

  return (
    <>
      <nav className={styles.desktopNav} aria-label="Módulos do ERP">
        <Link
          className={`${styles.overviewLink} ${pathname === "/" ? styles.active : ""}`}
          href="/"
          aria-current={pathname === "/" ? "page" : undefined}
        >
          <FiGrid aria-hidden="true" />
          <span>Painel ERP</span>
        </Link>

        <div className={styles.moduleList}>
          {visibleModules.map((module) => {
            const Icon = module.icon;
            const isOpen = openModule === module.code;
            const hasActiveItem = module.code === activeModule?.code;
            const treeId = `sidebar-module-${module.code}`;

            return (
              <section className={styles.module} key={module.code}>
                <button
                  className={`${styles.moduleButton} ${hasActiveItem ? styles.moduleActive : ""}`}
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={treeId}
                  onClick={() => setOpenModule((current) => current === module.code ? null : module.code)}
                >
                  <Icon aria-hidden="true" />
                  <span>{module.label}</span>
                  <FiChevronDown className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ""}`} aria-hidden="true" />
                </button>

                {isOpen ? (
                  <ul className={styles.tree} id={treeId}>
                    {module.items.map((item) => (
                      <li key={item.label}>
                        <TreeItem item={item} active={item.href === activeHref} />
                      </li>
                    ))}
                  </ul>
                ) : null}
              </section>
            );
          })}
        </div>
      </nav>

      <nav className={styles.mobileNav} aria-label="Acessos principais">
        {mobileItems.slice(0, 5).map((item) => {
          const Icon = item.icon;
          const active = item.href === "/" ? pathname === "/" : activeHref === item.href;
          return (
            <Link
              className={`${styles.mobileLink} ${active ? styles.mobileActive : ""}`}
              href={item.href}
              key={item.href}
              aria-current={active ? "page" : undefined}
            >
              <Icon aria-hidden="true" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}

function TreeItem({ item, active }: { item: SidebarItem; active: boolean }) {
  const Icon = item.icon;
  const content = (
    <>
      <Icon aria-hidden="true" />
      <span>{item.label}</span>
      {item.comingSoon ? <small>Em breve</small> : null}
    </>
  );

  if (!item.href) {
    return <span className={`${styles.treeItem} ${styles.disabled}`} aria-disabled="true">{content}</span>;
  }

  return (
    <Link
      className={`${styles.treeItem} ${active ? styles.active : ""}`}
      href={item.href}
      aria-current={active ? "page" : undefined}
    >
      {content}
    </Link>
  );
}

function findActiveHref(pathname: string, visibleModules: SidebarModule[]) {
  return visibleModules
    .flatMap((module) => module.items)
    .filter((item): item is SidebarItem & { href: string } => Boolean(item.href))
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
}
