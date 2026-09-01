import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { ReversalForm } from "@/components/erp/reversal-form";
import { getMovement } from "@/lib/erp/inventory/queries";
import { requireErpModule } from "@/lib/erp/organization/queries";

export const dynamic = "force-dynamic";
export default async function MovementDetailPage({ params }: { params: Promise<{ id: string }> }) { await requireErpModule("inventory"); const { id } = await params; const movement = await getMovement(id); if (!movement) notFound(); return <AppShell active="erp-movements" eyebrow="Movimentação de estoque" title={movement.productName}><section className="panel erp-detail-grid"><div><span>Identificador</span><strong>{movement.id}</strong></div><div><span>Depósito</span><strong>{movement.warehouseName}</strong></div><div><span>Tipo</span><strong>{movement.type}</strong></div><div><span>Quantidade</span><strong className={movement.quantity >= 0 ? "erp-positive" : "erp-negative"}>{movement.quantity.toLocaleString("pt-BR")}</strong></div><div><span>Data</span><strong>{new Date(movement.occurredAt).toLocaleString("pt-BR")}</strong></div><div><span>Observação</span><strong>{movement.notes ?? "—"}</strong></div></section><ReversalForm movementId={movement.id} disabled={movement.type === "reversal" || Boolean(movement.reversalOfId)} /></AppShell>; }
