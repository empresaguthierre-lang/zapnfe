import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Pagination } from "@/components/erp/pagination";
import { listMovements } from "@/lib/erp/inventory/queries";
import { requireErpModule } from "@/lib/erp/organization/queries";
import { parseListQuery } from "@/lib/erp/shared/query";

export const dynamic = "force-dynamic";
export default async function MovementsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) { await requireErpModule("inventory"); const query = parseListQuery(await searchParams); const result = await listMovements(query); return <AppShell active="movements" eyebrow="Livro de estoque" title="Movimentações" actions={<Link className="primary-button" href="/estoque">Novo ajuste</Link>}><div className="panel erp-table-wrap"><table className="erp-table"><thead><tr><th>Data</th><th>Produto</th><th>Depósito</th><th>Tipo</th><th>Quantidade</th><th>Detalhes</th></tr></thead><tbody>{result.rows.map((item) => <tr key={item.id}><td>{new Date(item.occurredAt).toLocaleString("pt-BR")}</td><td>{item.productName}</td><td>{item.warehouseName}</td><td>{movementLabel(item.type)}</td><td className={item.quantity >= 0 ? "erp-positive" : "erp-negative"}>{item.quantity > 0 ? "+" : ""}{item.quantity.toLocaleString("pt-BR")}</td><td><Link href={`/erp/estoque/movimentacoes/${item.id}`}>Abrir</Link></td></tr>)}</tbody></table>{result.rows.length === 0 ? <div className="erp-empty"><strong>Nenhuma movimentação</strong><p>O histórico imutável será exibido aqui.</p></div> : null}</div><Pagination page={result.page} count={result.count} pageSize={result.pageSize} basePath="/estoque/movimentacoes" query={{ warehouse: query.warehouse, product: query.product, type: query.type }} /></AppShell>; }
function movementLabel(type: string) { const labels: Record<string, string> = { opening_balance: "Saldo inicial", adjustment_in: "Ajuste de entrada", adjustment_out: "Ajuste de saída", reversal: "Reversão", reservation: "Reserva", release: "Liberação" }; return labels[type] ?? type; }

