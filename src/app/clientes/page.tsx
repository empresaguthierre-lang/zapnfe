import { FiPlus } from "react-icons/fi";
import { AppShell } from "@/components/app-shell";
import { CustomersList } from "@/components/customers-list";
import { requireOrganizationMember } from "@/lib/auth/authorization";
import { listCustomers } from "@/lib/data/operations";

export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  const member = await requireOrganizationMember();
  const customers = await listCustomers(member.organizationId);
  return (
    <AppShell active="customers" eyebrow="Relacionamento" title="Clientes">
      <section className="page-intro"><div><h2>Base de clientes</h2><p>Cadastros associados à empresa autenticada. O telefone identifica o cliente nas conversas do WhatsApp.</p></div><button className="primary-button" type="button" disabled title="Cadastro manual entra na próxima etapa"><FiPlus /> Novo cliente</button></section>
      <CustomersList customers={customers} />
    </AppShell>
  );
}
