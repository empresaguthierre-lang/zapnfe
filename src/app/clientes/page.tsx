import { FiPlus } from "react-icons/fi";
import { AppShell } from "@/components/app-shell";
import { CustomersList } from "@/components/customers-list";
import { requireOrganizationMember } from "@/lib/auth/authorization";

export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  await requireOrganizationMember();
  return (
    <AppShell active="customers" eyebrow="Relacionamento" title="Clientes">
      <section className="page-intro"><div><h2>Base de clientes</h2><p>O telefone será a principal chave para associar uma conversa ao cadastro correto.</p></div><button className="primary-button" type="button" disabled title="Formulário será persistido após conectar o Supabase"><FiPlus /> Novo cliente</button></section>
      <CustomersList />
    </AppShell>
  );
}
