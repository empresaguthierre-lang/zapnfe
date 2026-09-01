import { AppShell } from "@/components/app-shell";
import { WarehouseManager } from "@/components/erp/warehouse-manager";
import { listWarehouses } from "@/lib/erp/inventory/queries";
import { listBranches, requireErpModule } from "@/lib/erp/organization/queries";

export const dynamic = "force-dynamic";
export default async function WarehousesPage() { await requireErpModule("inventory"); const [warehouses, branches] = await Promise.all([listWarehouses(), listBranches()]); return <AppShell active="warehouses" eyebrow="Estoque" title="Depósitos"><WarehouseManager warehouses={warehouses} branches={branches} /></AppShell>; }

