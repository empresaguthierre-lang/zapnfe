import Link from "next/link";
import { notFound } from "next/navigation";
import { FiArrowLeft, FiUpload, FiCheckCircle, FiAlertCircle } from "react-icons/fi";
import { AppShell } from "@/components/app-shell";
import { requireOrganizationMember } from "@/lib/auth/authorization";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency } from "@/lib/data/format";

export const dynamic = "force-dynamic";

export default async function BankAccountDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const member = await requireOrganizationMember();
  const { id } = await params;
  const supabase = await createClient();

  const { data: account } = await supabase
    .from("bank_accounts")
    .select("*")
    .eq("id", id)
    .eq("organization_id", member.organizationId)
    .maybeSingle();

  if (!account) notFound();

  return (
    <AppShell active="finance" eyebrow="Conta Bancária" title={account.name} actions={<Link className="secondary-button" href="/financeiro/bancos"><FiArrowLeft /> Voltar aos bancos</Link>}>
      <section className="order-heading">
        <div>
          <h2>{account.bank_code} - {account.bank_name || account.name}</h2>
          <p>Saldo do Extrato: <strong>{formatCurrency(428291.00)}</strong></p>
        </div>
        <button className="primary-button"><FiUpload /> Importar OFX</button>
      </section>

      <div className="status-flow compact-flow" style={{ marginBottom: "24px" }}>
        <div><span>Pendentes</span><strong style={{ color: "var(--danger)" }}>18</strong></div>
        <div><span>Com sugestão</span><strong style={{ color: "var(--warning)" }}>14</strong></div>
        <div><span>Parciais</span><strong>2</strong></div>
        <div><span>Conciliados</span><strong style={{ color: "var(--success)" }}>327</strong></div>
      </div>

      <div className="panel data-panel">
        <div className="data-table">
          <div className="data-row data-header" style={{ gridTemplateColumns: "1fr 2fr 2fr 1fr" }}>
            <span>Data</span><span>Movimento</span><span>Conciliação</span><span style={{ textAlign: "right" }}>Ação</span>
          </div>

          <div className="data-row" style={{ gridTemplateColumns: "1fr 2fr 2fr 1fr" }}>
            <span>01/09/2026</span>
            <div><strong style={{ color: "var(--success)" }}>+ R$ 10.000,00</strong><br/><small>PIX MERCADO CENTRAL</small></div>
            <div>
              <span style={{ color: "var(--success)", display: "flex", alignItems: "center", gap: 4 }}><FiCheckCircle /> 98% — Sugestão encontrada</span>
              <small style={{ display: "block", color: "var(--text-secondary)" }}>NF 28191 • Parcela 1/3 • R$ 10.000</small>
            </div>
            <div style={{ textAlign: "right" }}><button className="primary-button" style={{ padding: "4px 12px", fontSize: "0.85em" }}>Conciliar</button></div>
          </div>

          <div className="data-row" style={{ gridTemplateColumns: "1fr 2fr 2fr 1fr" }}>
            <span>01/09/2026</span>
            <div><strong style={{ color: "var(--success)" }}>+ R$ 15.000,00</strong><br/><small>TRANSFERENCIA ABC LTDA</small></div>
            <div>
              <span style={{ color: "var(--warning)", display: "flex", alignItems: "center", gap: 4 }}><FiAlertCircle /> 3 possíveis títulos</span>
              <small style={{ display: "block", color: "var(--text-secondary)" }}>Clique em analisar para dividir o pagamento.</small>
            </div>
            <div style={{ textAlign: "right" }}><button className="secondary-button" style={{ padding: "4px 12px", fontSize: "0.85em" }}>Analisar</button></div>
          </div>

          <div className="data-row" style={{ gridTemplateColumns: "1fr 2fr 2fr 1fr" }}>
            <span>01/09/2026</span>
            <div><strong style={{ color: "var(--danger)" }}>- R$ 39,90</strong><br/><small>TARIFA PIX</small></div>
            <div>
              <span style={{ color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 4 }}>○ Não classificado</span>
            </div>
            <div style={{ textAlign: "right" }}><button className="secondary-button" style={{ padding: "4px 12px", fontSize: "0.85em" }}>Classificar</button></div>
          </div>

        </div>
      </div>
    </AppShell>
  );
}
