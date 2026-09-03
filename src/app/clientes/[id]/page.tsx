/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-require-imports */
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { requireOrganizationMember } from "@/lib/auth/authorization";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency, formatDateTime } from "@/lib/data/format";
import { FiArrowLeft, FiAlertCircle, FiLock, FiUnlock } from "react-icons/fi";
import { CustomerTabs } from "./tabs";

export const dynamic = "force-dynamic";

export default async function CustomerDetailPage({ params, searchParams }: { params: Promise<{ id: string }>, searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params;
  const { tab = "visao-geral" } = await searchParams;
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
    
  const { data: restrictions } = await supabase
    .from("customer_restrictions")
    .select("*, created_by_user:created_by(email)")
    .eq("customer_id", id)
    .is("released_at", null)
    .order("created_at", { ascending: false });

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
  
  const blocks = restrictions?.filter(r => r.severity === 'block') || [];

  return (
    <AppShell active="customers" eyebrow="Clientes" title={customer.name}>
      <div style={{ marginBottom: 16 }}>
        <Link href="/clientes" className="secondary-button" style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: "0.9em" }}>
          <FiArrowLeft /> Voltar
        </Link>
      </div>
      
      {blocks.length > 0 && (
        <div style={{ marginBottom: 24, padding: "16px", borderRadius: "12px", background: "#fef2f2", border: "1px solid #fecaca", display: "flex", gap: "12px", color: "#991b1b" }}>
           <FiLock size={24} style={{ flexShrink: 0, marginTop: 4 }} />
           <div>
             <strong style={{ fontSize: "14px", display: "block" }}>{blocks.length} bloqueio(s) ativo(s)</strong>
             <p style={{ margin: "4px 0 0 0", fontSize: "13px" }}>{blocks[0].module.toUpperCase()}: {blocks[0].reason}</p>
           </div>
        </div>
      )}

      <CustomerTabs activeTab={tab} customerId={id} restrictionsCount={blocks.length} />

      {tab === "financeiro" && metrics && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
          <div>
            <div className="panel" style={{ marginBottom: 24, padding: 20 }}>
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

            <div className="panel" style={{ padding: 20 }}>
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
            <div className="panel" style={{ border: `1px solid ${riskColor}`, padding: 20 }}>
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
      )}

      {tab === "restricoes" && (
        <div className="panel data-panel">
          <div className="data-table">
            <div className="data-row data-header" style={{ gridTemplateColumns: "1fr 2fr 1fr 1fr" }}>
              <span>Status</span><span>Restrição</span><span>Severidade</span><span style={{ textAlign: "right" }}>Ação</span>
            </div>
            
            {!restrictions || restrictions.length === 0 ? (
              <div className="data-row" style={{ display: "block", textAlign: "center", padding: "40px", color: "var(--text-secondary)" }}>
                Nenhuma restrição ativa. Cliente totalmente liberado.
              </div>
            ) : (
              restrictions.map(r => (
                <div key={r.id} className="data-row" style={{ gridTemplateColumns: "1fr 2fr 1fr 1fr" }}>
                  <div>
                    <span style={{ color: r.severity === 'block' ? "var(--danger)" : "var(--warning)", fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
                      {r.severity === 'block' ? <FiLock /> : <FiAlertCircle />} {r.severity.toUpperCase()}
                    </span>
                    <small style={{ color: "var(--text-secondary)", display: "block", marginTop: 4 }}>Desde {formatDateTime(r.created_at)}</small>
                  </div>
                  <div>
                    <strong>Módulo: {r.module.toUpperCase()} — {r.restriction_type}</strong>
                    <p style={{ margin: "4px 0 0 0", fontSize: "12px", color: "var(--text-secondary)" }}>{r.reason}</p>
                    <small style={{ color: "var(--text-secondary)", display: "block", marginTop: 4 }}>Escopo: {r.scope}</small>
                  </div>
                  <div>
                    <span style={{ fontSize: "12px" }}>Resp: {(r as any).created_by_user?.email || "Sistema"}</span>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <form action={async () => {
                      "use server";
                      const { createClient } = await import("@/lib/supabase/server");
                      const db = await createClient();
                      await db.rpc("customer_release_restriction", { p_org_id: member.organizationId, p_restriction_id: r.id, p_reason: "Desbloqueio manual" });
                      const { revalidatePath } = await import("next/cache");
                      revalidatePath(`/clientes/${id}`);
                    }}>
                      <button type="submit" className="secondary-button" style={{ fontSize: "12px", padding: "6px 12px", minHeight: "auto" }}>
                        <FiUnlock /> Desbloquear
                      </button>
                    </form>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
      
      {tab === "visao-geral" && (
         <div className="panel" style={{ padding: 40, textAlign: "center", color: "var(--text-secondary)" }}>
           Resumo do cliente em construção.
         </div>
      )}
      
      {tab === "fiscal" && (
         <div className="panel" style={{ padding: 40, textAlign: "center", color: "var(--text-secondary)" }}>
           Perfil fiscal em construção. (Bloco 4A.2)
         </div>
      )}
    </AppShell>
  );
}
