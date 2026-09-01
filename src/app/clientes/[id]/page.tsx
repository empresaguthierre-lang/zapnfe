import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { requireOrganizationMember } from "@/lib/auth/authorization";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency } from "@/lib/data/format";
import { FiArrowLeft, FiAlertCircle } from "react-icons/fi";

export const dynamic = "force-dynamic";

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const member = await requireOrganizationMember();
  const supabase = await createClient();

  const { data: customer, error } = await supabase
    .from("customers")
    .select("*")
    .eq("id", id)
    .eq("organization_id", member.organizationId)
    .single();

  if (error || !customer) return notFound();

  const { data: metrics } = await supabase
    .from("customer_financial_metrics")
    .select("*")
    .eq("customer_id", id)
    .single();

  let riskLevel = "🟢 Regular";
  let riskColor = "var(--success)";
  const riskFactors: string[] = [];
  const criticalOverdueDate = new Date();
  criticalOverdueDate.setDate(criticalOverdueDate.getDate() - 15);

  if (metrics) {
    if (metrics.overdue_amount > 0 && metrics.oldest_overdue_on && new Date(metrics.oldest_overdue_on) < criticalOverdueDate) {
      riskLevel = "🔴 Crítico";
      riskColor = "var(--danger)";
      riskFactors.push(`Título vencido há mais de 15 dias.`);
      riskFactors.push(`${formatCurrency(metrics.overdue_amount)} atualmente vencidos.`);
    } else if (metrics.late_installments >= 2 || metrics.average_delay_days > 5 || metrics.overdue_amount > 0) {
      riskLevel = "🟡 Atenção";
      riskColor = "var(--warning)";
      if (metrics.late_installments > 0) riskFactors.push(`${metrics.late_installments} parcelas tiveram atraso.`);
      if (metrics.average_delay_days > 0) riskFactors.push(`Atraso médio geral: ${Math.round(metrics.average_delay_days)} dias.`);
      if (metrics.overdue_amount > 0) riskFactors.push(`${formatCurrency(metrics.overdue_amount)} atualmente vencidos.`);
    }
  }

  return (
    <AppShell active="customers" eyebrow="Clientes" title={customer.name}>
      <div style={{ marginBottom: 16 }}>
        <Link href="/clientes" className="secondary-button" style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: "0.9em" }}>
          <FiArrowLeft /> Voltar
        </Link>
      </div>

      <div style={{ borderBottom: "1px solid var(--border)", marginBottom: 24 }}>
        <div style={{ display: "flex", gap: 24, fontWeight: 500 }}>
          <div style={{ padding: "8px 0", borderBottom: "2px solid var(--primary)", color: "var(--primary)" }}>Financeiro</div>
        </div>
      </div>

      {metrics ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
          <div>
            <div className="panel" style={{ marginBottom: 24 }}>
              <h4>Situação Atual</h4>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                <span style={{ color: "var(--text-secondary)" }}>Valor a Receber (Em Aberto)</span>
                <strong>{formatCurrency(metrics.open_amount)}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0" }}>
                <span style={{ color: "var(--text-secondary)" }}>Valor Vencido</span>
                <strong style={{ color: metrics.overdue_amount > 0 ? "var(--danger)" : "inherit" }}>{formatCurrency(metrics.overdue_amount)}</strong>
              </div>
            </div>

            <div className="panel">
              <h4>Histórico de Pagamentos</h4>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                <span style={{ color: "var(--text-secondary)" }}>Parcelas Pagas no Prazo</span>
                <strong>{metrics.on_time_installments} / {metrics.paid_installments} ({Math.round(metrics.on_time_rate)}%)</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                <span style={{ color: "var(--text-secondary)" }}>Parcelas Pagas com Atraso</span>
                <strong>{metrics.late_installments}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0" }}>
                <span style={{ color: "var(--text-secondary)" }}>Atraso Médio</span>
                <strong>{metrics.average_delay_days ? Math.round(metrics.average_delay_days) : 0} dias</strong>
              </div>
            </div>
          </div>

          <div>
            <div className="panel" style={{ border: `1px solid ${riskColor}` }}>
              <h4 style={{ color: riskColor }}>Risco Financeiro: {riskLevel}</h4>

              {riskFactors.length > 0 ? (
                <ul style={{ margin: "16px 0 0 0", paddingLeft: 20, color: "var(--text-secondary)" }}>
                  {riskFactors.map((f, i) => <li key={i}>{f}</li>)}
                </ul>
              ) : (
                <p style={{ margin: "16px 0 0 0", color: "var(--text-secondary)" }}>
                  Cliente com excelente histórico de pagamentos. Nenhuma pendência em atraso ou histórico negativo.
                </p>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="panel" style={{ textAlign: "center", padding: 48, color: "var(--text-secondary)" }}>
          <FiAlertCircle size={32} style={{ opacity: 0.5, marginBottom: 16 }} />
          <p>Nenhuma métrica financeira gerada para este cliente ainda.</p>
        </div>
      )}
    </AppShell>
  );
}
