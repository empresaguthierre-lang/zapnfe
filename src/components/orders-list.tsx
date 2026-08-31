"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { FiChevronRight, FiSearch } from "react-icons/fi";
import { StatusBadge } from "@/components/status-badge";
import { formatCurrency, formatDateTime } from "@/lib/data/format";
import { orderStatusLabel, type OrderStatus, type OrderSummary } from "@/lib/data/types";

export function OrdersList({ orders }: { orders: OrderSummary[] }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<OrderStatus | "all">("all");
  const normalized = query.trim().toLocaleLowerCase("pt-BR");
  const filtered = useMemo(() => orders.filter((order) => {
    const matchesQuery = !normalized || order.customerName.toLocaleLowerCase("pt-BR").includes(normalized) || String(order.number).includes(normalized) || order.customerPhone?.includes(normalized);
    return matchesQuery && (status === "all" || order.status === status);
  }), [normalized, orders, status]);

  return (
    <section className="panel data-panel">
      <div className="filter-bar">
        <label className="search-field"><FiSearch aria-hidden="true" /><span className="sr-only">Buscar pedidos</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por pedido, cliente ou telefone" maxLength={120} /></label>
        <label className="select-field"><span>Status</span><select value={status} onChange={(event) => setStatus(event.target.value as OrderStatus | "all")}><option value="all">Todos</option>{Object.entries(orderStatusLabel).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        <span className="result-count">{filtered.length} {filtered.length === 1 ? "pedido" : "pedidos"}</span>
      </div>
      <div className="data-table order-table">
        <div className="data-row data-header"><span>Pedido</span><span>Cliente</span><span>Entrada</span><span>Total</span><span>Status</span><span /></div>
        {filtered.map((order) => (
          <Link className="data-row" href={`/pedidos/${order.id}`} key={order.id}>
            <strong>#{order.number}</strong><span><b>{order.customerName}</b><small>{order.itemCount} {order.itemCount === 1 ? "item" : "itens"}</small></span><span>{formatDateTime(order.createdAt)}</span><strong>{formatCurrency(order.total)}</strong><StatusBadge status={order.status} /><FiChevronRight />
          </Link>
        ))}
      </div>
      {filtered.length === 0 ? <div className="empty-state"><strong>Nenhum pedido encontrado</strong><p>Revise a busca ou o filtro de status.</p></div> : null}
    </section>
  );
}
