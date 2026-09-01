import { AppShell } from "@/components/app-shell";
import { ComingSoon } from "@/components/erp/coming-soon";
import { requireErpModule } from "@/lib/erp/organization/queries";
export const dynamic = "force-dynamic";
export default async function FiscalPage() { await requireErpModule("fiscal"); return <AppShell active="fiscal" eyebrow="ERP" title="Fiscal"><ComingSoon title="Fiscal" description="A emissão Focus NFe continuará separada da aprovação do pedido e será integrada em homologação." /></AppShell>; }

