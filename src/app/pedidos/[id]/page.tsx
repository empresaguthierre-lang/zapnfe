import Link from "next/link";
import { notFound } from "next/navigation";
import { FiArrowLeft } from "react-icons/fi";
import { AppShell } from "@/components/app-shell";
import { OrderReview } from "@/components/order-review";
import { StatusBadge } from "@/components/status-badge";
import { requireOrganizationMember } from "@/lib/auth/authorization";
import { customerForOrder, formatDateTime, orders } from "@/lib/demo-data";

export const dynamic = "force-dynamic";

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireOrganizationMember();
  const { id } = await params;
  const order = orders.find((candidate) => candidate.id === id);
  if (!order) notFound();
  const customer = customerForOrder(order);

  return (
    <AppShell active="orders" eyebrow="Conferência" title={`Pedido #${order.number}`} actions={<Link className="secondary-button" href="/pedidos"><FiArrowLeft /> Voltar aos pedidos</Link>}>
      <section className="order-heading"><div><h2>{customer?.name}</h2><p>{formatDateTime(order.createdAt)} · origem demonstrativa do WhatsApp</p></div><StatusBadge status={order.status} /></section>
      <div className="status-flow" aria-label="Etapas do pedido"><span className="complete">Recebido</span><span className={order.status !== "received" ? "complete" : "current"}>Conferência</span><span className={order.status === "invoiced" || order.status === "completed" ? "complete" : "pending"}>Faturado</span><span className={order.status === "completed" ? "complete" : "pending"}>Finalizado</span></div>
      <OrderReview order={order} />
    </AppShell>
  );
}
