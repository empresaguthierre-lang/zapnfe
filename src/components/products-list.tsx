"use client";

import { useMemo, useState } from "react";
import { FiCheckCircle, FiSearch, FiXCircle } from "react-icons/fi";
import { formatCurrency, products } from "@/lib/demo-data";

export function ProductsList() {
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<"active" | "all" | "pending">("active");
  const normalized = query.trim().toLocaleLowerCase("pt-BR");
  const filtered = useMemo(() => products.filter((product) => {
    const matchesQuery = !normalized || [product.name, product.sku, ...product.aliases].some((value) => value.toLocaleLowerCase("pt-BR").includes(normalized));
    const matchesScope = scope === "all" || (scope === "active" ? product.active : !product.fiscalReady);
    return matchesQuery && matchesScope;
  }), [normalized, scope]);

  return (
    <section className="panel data-panel">
      <div className="filter-bar">
        <label className="search-field"><FiSearch /><span className="sr-only">Buscar produtos</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nome, SKU ou alias" maxLength={120} /></label>
        <label className="select-field"><span>Exibir</span><select value={scope} onChange={(event) => setScope(event.target.value as typeof scope)}><option value="active">Ativos</option><option value="pending">Fiscal pendente</option><option value="all">Todos</option></select></label>
        <span className="result-count">{filtered.length} produtos</span>
      </div>
      <div className="data-table product-table">
        <div className="data-row data-header"><span>Produto</span><span>SKU</span><span>Unidade</span><span>Preço</span><span>NCM</span><span>Fiscal</span></div>
        {filtered.map((product) => <div className="data-row" key={product.id}><span><b>{product.name}</b><small>{product.aliases.join(" · ")}</small></span><code>{product.sku}</code><span>{product.unit}</span><strong>{formatCurrency(product.price)}</strong><span>{product.ncm ?? "Não informado"}</span><span className={`readiness ${product.fiscalReady ? "ready" : "pending"}`}>{product.fiscalReady ? <FiCheckCircle /> : <FiXCircle />}{product.fiscalReady ? "Pronto" : "Pendente"}</span></div>)}
      </div>
    </section>
  );
}
