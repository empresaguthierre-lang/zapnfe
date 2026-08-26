import Link from "next/link";
import { FiPlus } from "react-icons/fi";
import { AppShell } from "@/components/app-shell";
import { OrdersList } from "@/components/orders-list";

export default function OrdersPage() {
  return (
    <AppShell active="orders" eyebrow="Operação" title="Pedidos" actions={<Link className="secondary-button" href="/configuracoes">Como conectar os dados</Link>}>
      <section className="page-intro"><div><h2>Fila de pedidos</h2><p>Pesquise, filtre e abra um pedido para conferir os itens extraídos.</p></div><button className="primary-button" type="button" disabled title="Disponível quando a persistência estiver conectada"><FiPlus /> Novo pedido</button></section>
      <OrdersList />
    </AppShell>
  );
}
