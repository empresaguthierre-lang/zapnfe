import { AppShell } from "@/components/app-shell";
import { PartyTable } from "@/components/erp/party-table";
import { listParties } from "@/lib/erp/catalog/queries";
import { parseListQuery } from "@/lib/erp/shared/query";

export const dynamic = "force-dynamic";
export default async function SuppliersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) { const query = parseListQuery(await searchParams); const result = await listParties("suppliers", query); return <AppShell active="suppliers" eyebrow="Cadastros" title="Fornecedores"><PartyTable {...result} basePath="/fornecedores" query={query.q} kind="fornecedor" /></AppShell>; }

