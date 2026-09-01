import { AppShell } from "@/components/app-shell";
import { getFormLookupsAction } from "@/app/financeiro/actions";
import { CreateReceivableForm } from "./client-form";

export const dynamic = "force-dynamic";

export default async function NovoRecebivelPage() {
  const lookups = await getFormLookupsAction();

  return (
    <AppShell active="finance" eyebrow="Financeiro / Contas a Receber" title="Novo Título Manual">
      <CreateReceivableForm lookups={lookups} />
    </AppShell>
  );
}
