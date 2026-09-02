"use client";

import Link from "next/link";

export function CustomerTabs({ activeTab, customerId, restrictionsCount }: { activeTab: string; customerId: string; restrictionsCount: number }) {
  const tabs = [
    { id: "visao-geral", label: "Visão Geral" },
    { id: "pedidos", label: "Pedidos" },
    { id: "financeiro", label: "Financeiro" },
    { id: "fiscal", label: "Fiscal" },
    { id: "restricoes", label: "Restrições", badge: restrictionsCount > 0 ? restrictionsCount : undefined },
    { id: "historico", label: "Histórico" }
  ];

  return (
    <div style={{ borderBottom: "1px solid var(--line)", marginBottom: 24, display: "flex", gap: 32 }}>
      {tabs.map(tab => {
        const isActive = activeTab === tab.id;
        return (
          <Link
            key={tab.id}
            href={`/clientes/${customerId}?tab=${tab.id}`}
            style={{
              padding: "12px 0",
              borderBottom: isActive ? "3px solid var(--blue)" : "3px solid transparent",
              color: isActive ? "var(--ink)" : "var(--muted)",
              fontWeight: isActive ? 750 : 500,
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: "13px"
            }}
          >
            {tab.label}
            {tab.badge !== undefined && (
              <span style={{
                background: "var(--danger)",
                color: "white",
                borderRadius: "99px",
                padding: "2px 6px",
                fontSize: "10px",
                fontWeight: 800
              }}>{tab.badge}</span>
            )}
          </Link>
        );
      })}
    </div>
  );
}