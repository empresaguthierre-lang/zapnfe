"use client";

import { useMemo, useState } from "react";
import { FiCheckCircle, FiSearch, FiXCircle } from "react-icons/fi";
import { formatCurrency } from "@/lib/data/format";
import type { Product } from "@/lib/data/types";

export function ProductsList({ products }: { products: Product[] }) {
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<"active" | "inactive" | "all">("active");
  const normalized = query.trim().toLocaleLowerCase("pt-BR");
  const filtered = useMemo(() => products.filter((product) => {
    const matchesQuery = !normalized || [product.name, product.sku, ...product.aliases].some((value) => value.toLocaleLowerCase("pt-BR").includes(normalized));
    const matchesScope = scope === "all" || (scope === "active" ? product.active : !product.active);
    return matchesQuery && matchesScope;
  }), [normalized, products, scope]);

  return (
    <section className="panel data-panel">
      <div className="filter-bar">
        <label className="search-field"><FiSearch /><span className="sr-only">Buscar produtos</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nome, SKU ou alias" maxLength={120} /></label>
        <label className="select-field"><span>Exibir</span><select value={scope} onChange={(event) => setScope(event.target.value as typeof scope)}><option value="active">Ativos</option><option value="inactive">Inativos</option><option value="all">Todos</option></select></label>
        <span className="result-count">{filtered.length} {filtered.length === 1 ? "produto" : "produtos"}</span>
      </div>
      <div className="data-table product-table product-table-live">
        <div className="data-row data-header"><span>Produto</span><span>SKU</span><span>Aliases</span><span>Unidade</span><span>Preço</span><span>Status</span></div>
        {filtered.map((product) => <div className="data-row" key={product.id}><span><b>{product.name}</b><small>ID {product.id.slice(0, 8)}</small></span><code>{product.sku}</code><span>{product.aliases.length ? product.aliases.join(" · ") : "Sem aliases"}</span><span>{product.unit}</span><strong>{formatCurrency(product.price)}</strong><span className={`readiness ${product.active ? "ready" : "pending"}`}>{product.active ? <FiCheckCircle /> : <FiXCircle />}{product.active ? "Ativo" : "Inativo"}</span></div>)}
      </div>
      {filtered.length === 0 ? <div className="empty-state"><strong>Nenhum produto encontrado</strong><p>Revise a busca ou o filtro selecionado.</p></div> : null}
    </section>
  );
}
