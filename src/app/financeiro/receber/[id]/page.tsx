import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { getReceivableDetailsAction, getFormLookupsAction } from "@/app/financeiro/actions";
import { formatCurrency } from "@/lib/data/format";
import type { FinanceLookups, ReceivableDetails } from "@/lib/finance/types";
import { FiArrowLeft } from "react-icons/fi";
import { ReceivableDetailClient } from "./client-detail";

export const dynamic = "force-dynamic";

export default async function ReceivableDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let data;
  try {
    data = await getReceivableDetailsAction(id);
  } catch {
    return notFound();
  }

  if (!data) return notFound();

  const lookups = await getFormLookupsAction();
  const typedData = data as unknown as ReceivableDetails;

  return (
    <AppShell active="finance" eyebrow="Contas a Receber" title={`Título ${data.document_number || "(Sem numeração)"}`}>
      <div style={{ marginBottom: 16 }}>
        <Link href="/financeiro/receber" className="secondary-button" style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: "0.9em" }}>
          <FiArrowLeft /> Voltar
        </Link>
      </div>

      <div className="panel" style={{ marginBottom: 24, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
        <div>
          <span className="eyebrow">Cliente</span>
          <p style={{ margin: "4px 0 0 0", fontWeight: 600 }}>{data.customers?.name}</p>
        </div>
        <div>
          <span className="eyebrow">Data de Emissão</span>
          <p style={{ margin: "4px 0 0 0" }}>{data.issued_on.split("-").reverse().join("/")}</p>
        </div>
        <div>
          <span className="eyebrow">Status do Título</span>
          <p style={{ margin: "4px 0 0 0" }}>
            {data.status === "open" ? "Em Aberto" : data.status === "partially_paid" ? "Parcialmente Pago" : data.status === "paid" ? "Pago" : "Cancelado"}
          </p>
        </div>

        <div>
          <span className="eyebrow">Valor Original</span>
          <p style={{ margin: "4px 0 0 0", fontWeight: 600 }}>{formatCurrency(data.original_amount)}</p>
        </div>
        <div>
          <span className="eyebrow">Em Aberto Total</span>
          <p style={{ margin: "4px 0 0 0", color: data.status !== "paid" ? "var(--danger)" : "var(--success)", fontWeight: 600 }}>
            {formatCurrency(typedData.receivable_installments.reduce((total, installment) => total + Number(installment.open_amount), 0))}
          </p>
        </div>
      </div>

      <ReceivableDetailClient data={typedData} lookups={lookups as unknown as FinanceLookups} />
    </AppShell>
  );
}
