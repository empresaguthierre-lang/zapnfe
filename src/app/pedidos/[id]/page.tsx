import Link from "next/link";
import { notFound } from "next/navigation";
import { FiArrowLeft } from "react-icons/fi";
import { z } from "zod";
import { AppShell } from "@/components/app-shell";
import { OrderReview } from "@/components/order-review";
import { StatusBadge } from "@/components/status-badge";
import { requireOrganizationMember } from "@/lib/auth/authorization";
import { formatDateTime } from "@/lib/data/format";
import { getOrderDetail, listProducts } from "@/lib/data/operations";

export const dynamic = "force-dynamic";

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const member = await requireOrganizationMember();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const [order, products] = await Promise.all([getOrderDetail(id, member.organizationId), listProducts(member.organizationId)]);
  if (!order) notFound();

  const invoiced = order.status === "invoiced" || order.status === "completed";
  return (
    <AppShell active="orders" eyebrow="Conferência" title={`Pedido #${order.number}`} actions={<Link className="secondary-button" href="/pedidos"><FiArrowLeft /> Voltar aos pedidos</Link>}>
      <section className="order-heading"><div><h2>{order.customerName}</h2><p>{formatDateTime(order.createdAt)} · origem WhatsApp</p></div><StatusBadge status={order.status} /></section>
      <div className="status-flow compact-flow" aria-label="Etapas do pedido">
        <div><span>1. Entrada</span><strong>Recebido</strong></div>
        <div><span>2. Revisão</span><strong>{order.status === "received" ? "Pendente" : "Conferência"}</strong></div>
        <div><span>3. Aprovação</span><strong>{["approved", "invoiced", "completed"].includes(order.status) ? "Aprovado" : "Pendente"}</strong></div>
        <div><span>4. Fiscal</span><strong>{invoiced ? "Faturado" : "Aguardando"}</strong></div>
      </div>
      <OrderReview order={order} products={products} />
    </AppShell>
  );
}
