import { FiDownload, FiPlus } from "react-icons/fi";
import { AppShell } from "@/components/app-shell";
import { ProductsList } from "@/components/products-list";
import { requireOrganizationMember } from "@/lib/auth/authorization";
import { listProducts } from "@/lib/data/operations";

export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  const member = await requireOrganizationMember();
  const products = await listProducts(member.organizationId);
  return (
    <AppShell active="products" eyebrow="Catálogo" title="Produtos" actions={<button className="secondary-button" type="button" disabled><FiDownload /> Importar CSV</button>}>
      <section className="page-intro"><div><h2>Catálogo comercial</h2><p>Produtos e aliases reais do Supabase usados para interpretar os pedidos recebidos pelo WhatsApp.</p></div><button className="primary-button" type="button" disabled title="Cadastro manual entra na próxima etapa"><FiPlus /> Novo produto</button></section>
      <ProductsList products={products} />
    </AppShell>
  );
}
