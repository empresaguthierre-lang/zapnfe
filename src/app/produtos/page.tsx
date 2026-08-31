import { FiDownload, FiPlus } from "react-icons/fi";
import { AppShell } from "@/components/app-shell";
import { ProductsList } from "@/components/products-list";
import { requireOrganizationMember } from "@/lib/auth/authorization";

export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  await requireOrganizationMember();
  return (
    <AppShell active="products" eyebrow="Catálogo" title="Produtos" actions={<button className="secondary-button" type="button" disabled><FiDownload /> Importar CSV</button>}>
      <section className="page-intro"><div><h2>Catálogo comercial e fiscal</h2><p>Aliases ajudam a reconhecer a linguagem usada nos pedidos do WhatsApp.</p></div><button className="primary-button" type="button" disabled title="Formulário será persistido após conectar o Supabase"><FiPlus /> Novo produto</button></section>
      <ProductsList />
    </AppShell>
  );
}
