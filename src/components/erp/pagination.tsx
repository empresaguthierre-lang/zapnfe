import Link from "next/link";

export function Pagination({ page, count, pageSize, basePath, query }: { page: number; count: number; pageSize: number; basePath: string; query?: Record<string, string | undefined> }) {
  const pages = Math.max(1, Math.ceil(count / pageSize));
  if (pages <= 1) return <p className="erp-page-count">{count} registro{count === 1 ? "" : "s"}</p>;
  const href = (nextPage: number) => { const params = new URLSearchParams(); Object.entries(query ?? {}).forEach(([key, value]) => { if (value) params.set(key, value); }); params.set("page", String(nextPage)); return `${basePath}?${params}`; };
  return <nav className="erp-pagination" aria-label="Paginação"><Link aria-disabled={page <= 1} className={page <= 1 ? "disabled" : ""} href={href(Math.max(1, page - 1))}>Anterior</Link><span>Página {page} de {pages} · {count} registros</span><Link aria-disabled={page >= pages} className={page >= pages ? "disabled" : ""} href={href(Math.min(pages, page + 1))}>Próxima</Link></nav>;
}
