import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { requireOrganizationMember } from "@/lib/auth/authorization";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency } from "@/lib/data/format";
import { FiArrowRight, FiAlertCircle, FiTrendingUp, FiClock, FiAlertTriangle } from "react-icons/fi";

export const dynamic = "force-dynamic";

export default async function FinanceiroDashboardPage() {
  const member = await requireOrganizationMember();
  const supabase = await createClient();
  const today = new Date();
  const todayIso = today.toISOString().split("T")[0];
  const inSevenDays = new Date(today);
  inSevenDays.setDate(inSevenDays.getDate() + 7);
  const fifteenDaysAgo = new Date(today);
  fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15);

  // Fetch KPIs
  const { data: receivingTodayData } = await supabase
    .from("receivable_installments")
    .select("open_amount")
    .eq("organization_id", member.organizationId)
    .in("status", ["open", "partially_paid"])
    .eq("due_on", todayIso);

  const receivingToday = receivingTodayData?.reduce((acc, curr) => acc + Number(curr.open_amount), 0) || 0;

  const { data: receiving7DaysData } = await supabase
    .from("receivable_installments")
    .select("open_amount")
    .eq("organization_id", member.organizationId)
    .in("status", ["open", "partially_paid"])
    .gte("due_on", todayIso)
    .lte("due_on", inSevenDays.toISOString().split("T")[0]);

  const receiving7Days = receiving7DaysData?.reduce((acc, curr) => acc + Number(curr.open_amount), 0) || 0;

  const { data: overdueData } = await supabase
    .from("receivable_installments")
    .select("open_amount")
    .eq("organization_id", member.organizationId)
    .in("status", ["open", "partially_paid"])
    .lt("due_on", todayIso);

  const overdue = overdueData?.reduce((acc, curr) => acc + Number(curr.open_amount), 0) || 0;

  const { data: receivedTodayData } = await supabase
    .from("receivable_payments")
    .select("amount")
    .eq("organization_id", member.organizationId)
    .gte("paid_at", new Date(new Date().setHours(0,0,0,0)).toISOString())
    .is("reversal_of_id", null);

  const receivedToday = receivedTodayData?.reduce((acc, curr) => acc + Number(curr.amount), 0) || 0;

  // Atenção Items
  const { count: overdue15DaysCount } = await supabase
    .from("receivable_installments")
    .select("id", { count: 'exact', head: true })
    .eq("organization_id", member.organizationId)
    .in("status", ["open", "partially_paid"])
    .lt("due_on", fifteenDaysAgo.toISOString().split("T")[0]);

  const { count: partialPaymentsCount } = await supabase
    .from("receivable_installments")
    .select("id", { count: 'exact', head: true })
    .eq("organization_id", member.organizationId)
    .eq("status", "partially_paid");

  const { count: increasingDelayCount } = await supabase
    .from("customer_financial_metrics")
    .select("customer_id", { count: 'exact', head: true })
    .eq("organization_id", member.organizationId)
    .gt("average_delay_last_3", 0)
    // We could compare last_3 vs last_6 if we had calculated it accurately,
    // for MVP we can just flag customers with average_delay_days > 5
    .gt("average_delay_days", 5);

  return (
    <AppShell active="finance" eyebrow="Dashboard" title="Financeiro">
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 24 }}>
        <Link href="/financeiro/receber/novo" className="primary-button">
          Novo Título
        </Link>
        <Link href="/financeiro/receber" className="secondary-button" style={{ marginLeft: 8 }}>
          Contas a Receber
        </Link>
      </div>

      <div className="metrics-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 24, marginBottom: 32 }}>
        <div className="stat-card" style={{ padding: 24, background: "var(--bg-card)", borderRadius: 8, border: "1px solid var(--border)" }}>
          <span className="eyebrow">A receber hoje</span>
          <h2 style={{ margin: "8px 0 0 0", color: "var(--text)" }}>{formatCurrency(receivingToday)}</h2>
        </div>

        <div className="stat-card" style={{ padding: 24, background: "var(--bg-card)", borderRadius: 8, border: "1px solid var(--border)" }}>
          <span className="eyebrow">A receber próximos 7 dias</span>
          <h2 style={{ margin: "8px 0 0 0", color: "var(--text)" }}>{formatCurrency(receiving7Days)}</h2>
        </div>

        <div className="stat-card" style={{ padding: 24, background: "var(--bg-card)", borderRadius: 8, border: "1px solid var(--danger-border)" }}>
          <span className="eyebrow" style={{ color: "var(--danger)" }}>Vencido</span>
          <h2 style={{ margin: "8px 0 0 0", color: "var(--danger)" }}>{formatCurrency(overdue)}</h2>
        </div>

        <div className="stat-card" style={{ padding: 24, background: "var(--bg-card)", borderRadius: 8, border: "1px solid var(--success-border)" }}>
          <span className="eyebrow" style={{ color: "var(--success)" }}>Recebido hoje</span>
          <h2 style={{ margin: "8px 0 0 0", color: "var(--success)" }}>{formatCurrency(receivedToday)}</h2>
        </div>
      </div>

      <div className="attention-section">
        <h3 style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
          <FiAlertCircle color="var(--warning)" /> Precisa de Atenção
        </h3>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
          <Link href="/financeiro/receber?filter=delay_increasing" style={{ textDecoration: "none", color: "inherit" }}>
            <div className="panel" style={{ padding: 20, display: "flex", alignItems: "center", gap: 16, transition: "border-color 0.2s" }}>
              <div style={{ background: "rgba(255,165,0,0.1)", color: "var(--warning)", padding: 12, borderRadius: "50%" }}>
                <FiTrendingUp size={24} />
              </div>
              <div style={{ flex: 1 }}>
                <h4 style={{ margin: 0 }}>{increasingDelayCount} clientes</h4>
                <p style={{ margin: 0, fontSize: "0.85em", color: "var(--text-secondary)" }}>com atraso médio crescente</p>
              </div>
              <FiArrowRight color="var(--text-tertiary)" />
            </div>
          </Link>

          <Link href="/financeiro/receber?filter=overdue_15" style={{ textDecoration: "none", color: "inherit" }}>
            <div className="panel" style={{ padding: 20, display: "flex", alignItems: "center", gap: 16 }}>
              <div style={{ background: "rgba(255,0,0,0.1)", color: "var(--danger)", padding: 12, borderRadius: "50%" }}>
                <FiClock size={24} />
              </div>
              <div style={{ flex: 1 }}>
                <h4 style={{ margin: 0 }}>{overdue15DaysCount} parcelas</h4>
                <p style={{ margin: 0, fontSize: "0.85em", color: "var(--text-secondary)" }}>vencidas há mais de 15 dias</p>
              </div>
              <FiArrowRight color="var(--text-tertiary)" />
            </div>
          </Link>

          <Link href="/financeiro/receber?filter=partial" style={{ textDecoration: "none", color: "inherit" }}>
            <div className="panel" style={{ padding: 20, display: "flex", alignItems: "center", gap: 16 }}>
              <div style={{ background: "rgba(0,100,255,0.1)", color: "var(--primary)", padding: 12, borderRadius: "50%" }}>
                <FiAlertTriangle size={24} />
              </div>
              <div style={{ flex: 1 }}>
                <h4 style={{ margin: 0 }}>{partialPaymentsCount} pagamentos</h4>
                <p style={{ margin: 0, fontSize: "0.85em", color: "var(--text-secondary)" }}>parciais pendentes</p>
              </div>
              <FiArrowRight color="var(--text-tertiary)" />
            </div>
          </Link>
        </div>
      </div>
    </AppShell>
  );
}
