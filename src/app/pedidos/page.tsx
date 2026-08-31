import Link from "next/link";
import { FiPlus } from "react-icons/fi";
import { AppShell } from "@/components/app-shell";
import { OrdersList } from "@/components/orders-list";
import { requireOrganizationMember } from "@/lib/auth/authorization";

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const member = await requireOrganizationMember();
  return (
    <AppShell active="orders" eyebrow="Operação" title="Pedidos" actions={member.role === "admin" ? <Link className="secondary-button" href="/configuracoes">Como conectar os dados</Link> : undefined}>
      <section className="page-intro"><div><h2>Fila de pedidos</h2><p>Pesquise, filtre e abra um pedido para conferir os itens extraídos.</p></div><button className="primary-button" type="button" disabled title="Disponível quando a persistência estiver conectada"><FiPlus /> Novo pedido</button></section>
      <OrdersList />
    </AppShell>
  );
}
