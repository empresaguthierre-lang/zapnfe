import { AppShell } from "@/components/app-shell";
import { PartyTable } from "@/components/erp/party-table";
import { listParties } from "@/lib/erp/catalog/queries";
import { parseListQuery } from "@/lib/erp/shared/query";

export const dynamic = "force-dynamic";
export default async function CustomersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) { const query = parseListQuery(await searchParams); const result = await listParties("customers", query); return <AppShell active="customers" eyebrow="Cadastros" title="Clientes"><PartyTable {...result} basePath="/clientes" query={query.q} kind="cliente" /></AppShell>; }

