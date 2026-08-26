"use client";

import { useMemo, useState } from "react";
import { FiMapPin, FiSearch } from "react-icons/fi";
import { customers, formatCurrency } from "@/lib/demo-data";

export function CustomersList() {
  const [query, setQuery] = useState("");
  const normalized = query.trim().toLocaleLowerCase("pt-BR");
  const filtered = useMemo(() => customers.filter((customer) => !normalized || [customer.name, customer.phone, customer.document, customer.city].some((value) => value.toLocaleLowerCase("pt-BR").includes(normalized))), [normalized]);

  return (
    <section className="panel data-panel">
      <div className="filter-bar"><label className="search-field"><FiSearch /><span className="sr-only">Buscar clientes</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nome, CNPJ, telefone ou cidade" maxLength={120} /></label><span className="result-count">{filtered.length} clientes</span></div>
      <div className="data-table customer-table">
        <div className="data-row data-header"><span>Cliente</span><span>Documento</span><span>Telefone</span><span>Cidade</span><span>Pedidos</span><span>Total comprado</span></div>
        {filtered.map((customer) => <div className="data-row" key={customer.id}><span><b>{customer.name}</b><small>Cliente ativo</small></span><span>{customer.document}</span><span>{customer.phone}</span><span className="with-icon"><FiMapPin />{customer.city}</span><strong>{customer.orderCount}</strong><strong>{formatCurrency(customer.totalPurchased)}</strong></div>)}
      </div>
    </section>
  );
}
