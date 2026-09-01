import Link from "next/link";
import { notFound } from "next/navigation";
import { FiArrowLeft, FiAlertTriangle } from "react-icons/fi";
import { z } from "zod";
import { AppShell } from "@/components/app-shell";
import { OrderReview } from "@/components/order-review";
import { StatusBadge } from "@/components/status-badge";
import { requireOrganizationMember } from "@/lib/auth/authorization";
import { formatDateTime } from "@/lib/data/format";
import { getOrderDetail, listProducts } from "@/lib/data/operations";
import { getOrderAuditsAction, getCreditExposureAction } from "@/app/pedidos/actions";
import type { Product } from "@/lib/data/types";

type OrderAudit = {
  id: string;
  source_order_id: string | null;
  product_id: string;
  quantity: number;
  reason: string;
  created_at: string;
  target_order: { number: number } | null;
  created_by_user: { name: string | null; email: string | null } | null;
};

export const dynamic = "force-dynamic";

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const member = await requireOrganizationMember();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  const [order, products, audits, creditExposure] = await Promise.all([
    getOrderDetail(id, member.organizationId),
    listProducts(member.organizationId),
    getOrderAuditsAction(id),
    getCreditExposureAction(id)
  ]);

  if (!order) notFound();

  const invoiced = order.status === "invoiced" || order.status === "completed";

  // Audits where this order lost stock
  const typedAudits = (audits ?? []) as unknown as OrderAudit[];
  const lostStockAudits = typedAudits.filter((audit) => audit.source_order_id === id && audit.quantity > 0);

  return (
    <AppShell active="orders" eyebrow="Conferência" title={`Pedido #${order.number}`} actions={<Link className="secondary-button" href="/pedidos"><FiArrowLeft /> Voltar aos pedidos</Link>}>
      <section className="order-heading"><div><h2>{order.customerName}</h2><p>{formatDateTime(order.createdAt)} • origem WhatsApp</p></div><StatusBadge status={order.status} /></section>

      {lostStockAudits.length > 0 && (
        <div style={{ marginBottom: 24, display: "flex", flexDirection: "column", gap: 12 }}>
          {lostStockAudits.map((audit) => {
            const product = products.find((candidate: Product) => candidate.id === audit.product_id);
            return (
              <div key={audit.id} className="panel action-error" style={{ background: "var(--bg-card)", borderLeft: "4px solid var(--danger)", padding: 16 }}>
                <h4 style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--danger)", margin: "0 0 8px 0" }}>
                  <FiAlertTriangle /> RESERVA ALTERADA
                </h4>
                <p style={{ margin: "0 0 8px 0" }}>
                  <strong>{audit.quantity} UN</strong> de {product?.name || "Produto desconhecido"} foram realocadas para o Pedido <strong>#{audit.target_order?.number || "Desconhecido"}</strong>.
                </p>
                <div style={{ fontSize: "0.85em", color: "var(--text-secondary)" }}>
                  <div><strong>Motivo:</strong> {audit.reason}</div>
                  <div><strong>Por:</strong> {audit.created_by_user?.name || audit.created_by_user?.email || "Sistema"}</div>
                  <div><strong>Em:</strong> {formatDateTime(audit.created_at)}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="status-flow compact-flow" aria-label="Etapas do pedido">
        <div><span>1. Entrada</span><strong>Recebido</strong></div>
        <div><span>2. Revisão</span><strong>{order.status === "received" ? "Pendente" : "Conferência"}</strong></div>
        <div><span>3. Aprovação</span><strong>{["approved", "invoiced", "completed"].includes(order.status) ? "Aprovado" : "Pendente"}</strong></div>
        <div><span>4. Fiscal</span><strong>{invoiced ? "Faturado" : "Aguardando"}</strong></div>
      </div>
      <OrderReview order={order} products={products} creditExposure={creditExposure} />
    </AppShell>
  );
}
