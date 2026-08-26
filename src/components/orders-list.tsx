"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { FiChevronRight, FiSearch } from "react-icons/fi";
import { StatusBadge } from "@/components/status-badge";
import { customerForOrder, formatCurrency, formatDateTime, orders, orderStatusLabel, orderTotal, type OrderStatus } from "@/lib/demo-data";

export function OrdersList() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<OrderStatus | "all">("all");
  const normalized = query.trim().toLocaleLowerCase("pt-BR");
  const filtered = useMemo(() => orders.filter((order) => {
    const customer = customerForOrder(order);
    const matchesQuery = !normalized || customer?.name.toLocaleLowerCase("pt-BR").includes(normalized) || String(order.number).includes(normalized);
    return matchesQuery && (status === "all" || order.status === status);
  }), [normalized, status]);

  return (
    <section className="panel data-panel">
      <div className="filter-bar">
        <label className="search-field"><FiSearch aria-hidden="true" /><span className="sr-only">Buscar pedidos</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por pedido ou cliente" maxLength={120} /></label>
        <label className="select-field"><span>Status</span><select value={status} onChange={(event) => setStatus(event.target.value as OrderStatus | "all")}><option value="all">Todos</option>{Object.entries(orderStatusLabel).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        <span className="result-count">{filtered.length} {filtered.length === 1 ? "pedido" : "pedidos"}</span>
      </div>
      <div className="data-table order-table">
        <div className="data-row data-header"><span>Pedido</span><span>Cliente</span><span>Entrada</span><span>Total</span><span>Status</span><span /></div>
        {filtered.map((order) => {
          const customer = customerForOrder(order);
          return (
            <Link className="data-row" href={`/pedidos/${order.id}`} key={order.id}>
              <strong>#{order.number}</strong><span><b>{customer?.name}</b><small>{order.items.length} itens</small></span><span>{formatDateTime(order.createdAt)}</span><strong>{formatCurrency(orderTotal(order))}</strong><StatusBadge status={order.status} /><FiChevronRight />
            </Link>
          );
        })}
      </div>
      {filtered.length === 0 ? <div className="empty-state"><strong>Nenhum pedido encontrado</strong><p>Revise a busca ou o filtro de status.</p></div> : null}
    </section>
  );
}
