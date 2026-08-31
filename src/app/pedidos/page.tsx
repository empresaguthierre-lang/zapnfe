import Link from "next/link";
import { FiPlus } from "react-icons/fi";
import { AppShell } from "@/components/app-shell";
import { OrdersList } from "@/components/orders-list";
import { requireOrganizationMember } from "@/lib/auth/authorization";
import { listOrders } from "@/lib/data/operations";

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const member = await requireOrganizationMember();
  const orders = await listOrders(member.organizationId);
  return (
    <AppShell active="orders" eyebrow="Operação" title="Pedidos" actions={member.role === "admin" ? <Link className="secondary-button" href="/configuracoes">Configurar integrações</Link> : undefined}>
      <section className="page-intro"><div><h2>Fila de pedidos</h2><p>Dados reais da organização autenticada, protegidos pelas políticas RLS do Supabase.</p></div><button className="primary-button" type="button" disabled title="Pedidos entram automaticamente pelo WhatsApp"><FiPlus /> Novo pedido</button></section>
      <OrdersList orders={orders} />
    </AppShell>
  );
}
