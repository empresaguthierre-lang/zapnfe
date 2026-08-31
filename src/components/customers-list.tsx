"use client";

import { useMemo, useState } from "react";
import { FiSearch } from "react-icons/fi";
import { formatCurrency, formatDateTime } from "@/lib/data/format";
import type { Customer } from "@/lib/data/types";

export function CustomersList({ customers }: { customers: Customer[] }) {
  const [query, setQuery] = useState("");
  const normalized = query.trim().toLocaleLowerCase("pt-BR");
  const filtered = useMemo(() => customers.filter((customer) => !normalized || [customer.name, customer.phone, customer.document ?? ""].some((value) => value.toLocaleLowerCase("pt-BR").includes(normalized))), [customers, normalized]);

  return (
    <section className="panel data-panel">
      <div className="filter-bar"><label className="search-field"><FiSearch /><span className="sr-only">Buscar clientes</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nome, documento ou telefone" maxLength={120} /></label><span className="result-count">{filtered.length} {filtered.length === 1 ? "cliente" : "clientes"}</span></div>
      <div className="data-table customer-table customer-table-live">
        <div className="data-row data-header"><span>Cliente</span><span>Documento</span><span>Telefone</span><span>Cadastro</span><span>Pedidos</span><span>Total em pedidos</span></div>
        {filtered.map((customer) => <div className="data-row" key={customer.id}><span><b>{customer.name}</b><small>{customer.active ? "Cliente ativo" : "Cliente inativo"}</small></span><span>{customer.document || "Não informado"}</span><span>{customer.phone}</span><span>{formatDateTime(customer.createdAt)}</span><strong>{customer.orderCount}</strong><strong>{formatCurrency(customer.totalPurchased)}</strong></div>)}
      </div>
      {filtered.length === 0 ? <div className="empty-state"><strong>Nenhum cliente encontrado</strong><p>Revise a busca ou aguarde a entrada de novos pedidos.</p></div> : null}
    </section>
  );
}
