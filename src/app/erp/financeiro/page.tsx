import { AppShell } from "@/components/app-shell";
import { ComingSoon } from "@/components/erp/coming-soon";
import { requireErpModule } from "@/lib/erp/organization/queries";
export const dynamic = "force-dynamic";
export default async function FinancePage() { await requireErpModule("finance"); return <AppShell active="erp-finance" eyebrow="ERP" title="Financeiro"><ComingSoon title="Financeiro" description="Contas a receber e pagar entrarão após a validação do núcleo de cadastros, pedidos e estoque." /></AppShell>; }
