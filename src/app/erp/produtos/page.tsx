import Link from "next/link";
import { FiPlus } from "react-icons/fi";
import { AppShell } from "@/components/app-shell";
import { DebouncedSearch } from "@/components/erp/debounced-search";
import { Pagination } from "@/components/erp/pagination";
import { listProducts } from "@/lib/erp/catalog/queries";
import { parseListQuery } from "@/lib/erp/shared/query";

export const dynamic = "force-dynamic";
export default async function ErpProductsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = parseListQuery(await searchParams); const result = await listProducts(query);
  return <AppShell active="erp-products" eyebrow="Cadastros" title="Produtos" actions={<Link className="primary-button" href="/erp/produtos/novo"><FiPlus /> Novo produto</Link>}><section className="erp-toolbar"><DebouncedSearch placeholder="Nome, SKU ou código de barras" /><div className="erp-filter-links"><Link className={!query.status ? "active" : ""} href="/erp/produtos">Todos</Link><Link className={query.status === "active" ? "active" : ""} href="/erp/produtos?status=active">Ativos</Link><Link className={query.status === "inactive" ? "active" : ""} href="/erp/produtos?status=inactive">Inativos</Link></div></section><div className="panel erp-table-wrap"><table className="erp-table"><thead><tr><th>SKU</th><th>Produto</th><th>Categoria</th><th>Unidade</th><th>Preço</th><th>Estoque</th><th>Status</th></tr></thead><tbody>{result.rows.map((item) => <tr key={item.id}><td><Link href={`/erp/produtos/${item.id}`}>{item.sku}</Link></td><td><strong>{item.name}</strong><small>{item.barcode ?? "Sem código de barras"}</small></td><td>{item.categoryName ?? "—"}</td><td>{item.unitCode ?? "—"}</td><td>{item.salePrice.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</td><td>{item.trackStock ? `Mín. ${item.minimumStock}` : "Não controlado"}</td><td><span className={`erp-status ${item.active ? "ok" : "muted"}`}>{item.active ? "Ativo" : "Inativo"}</span></td></tr>)}</tbody></table>{result.rows.length === 0 ? <div className="erp-empty"><strong>Nenhum produto encontrado</strong><p>Cadastre o primeiro item ou altere os filtros.</p></div> : null}</div><Pagination page={result.page} count={result.count} pageSize={result.pageSize} basePath="/erp/produtos" query={{ q: query.q, status: query.status }} /></AppShell>;
}
