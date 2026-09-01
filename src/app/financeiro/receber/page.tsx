import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { requireOrganizationMember } from "@/lib/auth/authorization";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency } from "@/lib/data/format";
import type { ReceivableListRow } from "@/lib/finance/types";
import { FiArrowLeft, FiPlus, FiAlertCircle } from "react-icons/fi";

export const dynamic = "force-dynamic";

export default async function ReceberPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const member = await requireOrganizationMember();
  const supabase = await createClient();
  const { filter } = await searchParams;
  const overdueCutoff = new Date();
  overdueCutoff.setDate(overdueCutoff.getDate() - 15);

  let query = supabase
    .from("receivable_installments")
    .select("*, accounts_receivable(document_number, description, customer_id, customers(name))")
    .eq("organization_id", member.organizationId);

  if (filter === "overdue_15") {
    query = query
      .in("status", ["open", "partially_paid"])
      .lt("due_on", overdueCutoff.toISOString().split("T")[0]);
  } else if (filter === "partial") {
    query = query.eq("status", "partially_paid");
  } else {
    // Default show open/partially paid
    query = query.in("status", ["open", "partially_paid"]);
  }

  const { data: installments } = await query.order("due_on", { ascending: true });

  return (
    <AppShell active="finance" eyebrow="Financeiro" title="Contas a Receber" actions={<Link className="primary-button" href="/financeiro/receber/novo"><FiPlus /> Novo Título</Link>}>

      <div style={{ marginBottom: 16 }}>
        <Link href="/financeiro" className="secondary-button" style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: "0.9em" }}>
          <FiArrowLeft /> Voltar ao Dashboard
        </Link>
      </div>

      <div className="panel" style={{ padding: 0 }}>
        {(!installments || installments.length === 0) ? (
          <div style={{ padding: 48, textAlign: "center", color: "var(--text-secondary)" }}>
            <FiAlertCircle size={32} style={{ opacity: 0.5, marginBottom: 16 }} />
            <p>Nenhuma parcela encontrada.</p>
          </div>
        ) : (
          <table className="data-table" style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "left" }}>
                <th style={{ padding: "12px 16px" }}>Vencimento</th>
                <th style={{ padding: "12px 16px" }}>Cliente</th>
                <th style={{ padding: "12px 16px" }}>Documento</th>
                <th style={{ padding: "12px 16px" }}>Parcela</th>
                <th style={{ padding: "12px 16px", textAlign: "right" }}>Valor Original</th>
                <th style={{ padding: "12px 16px", textAlign: "right" }}>Em Aberto</th>
                <th style={{ padding: "12px 16px" }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {(installments as unknown as ReceivableListRow[]).map((inst) => {
                const customer = inst.accounts_receivable?.customers?.name || "Desconhecido";
                const isOverdue = new Date(inst.due_on) < new Date() && (inst.status === "open" || inst.status === "partially_paid");
                return (
                  <tr key={inst.id} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "12px 16px" }}>
                      <span style={{ color: isOverdue ? "var(--danger)" : "inherit", fontWeight: isOverdue ? 600 : 400 }}>
                        {inst.due_on.split("-").reverse().join("/")}
                      </span>
                    </td>
                    <td style={{ padding: "12px 16px" }}>{customer}</td>
                    <td style={{ padding: "12px 16px" }}>{inst.accounts_receivable?.document_number || "-"}</td>
                    <td style={{ padding: "12px 16px" }}>{inst.installment_number}</td>
                    <td style={{ padding: "12px 16px", textAlign: "right" }}>{formatCurrency(inst.original_amount)}</td>
                    <td style={{ padding: "12px 16px", textAlign: "right", fontWeight: 600 }}>{formatCurrency(inst.open_amount)}</td>
                    <td style={{ padding: "12px 16px" }}>
                      {inst.status === "partially_paid" ? (
                        <span style={{ padding: "4px 8px", borderRadius: "4px", fontSize: "0.85em", fontWeight: 500, background: "rgba(255, 165, 0, 0.1)", color: "var(--warning)", border: "1px solid rgba(255,165,0,0.3)" }}>Parcial</span>
                      ) : isOverdue ? (
                        <span style={{ padding: "4px 8px", borderRadius: "4px", fontSize: "0.85em", fontWeight: 500, background: "rgba(255, 0, 0, 0.1)", color: "var(--danger)", border: "1px solid rgba(255,0,0,0.3)" }}>Vencido</span>
                      ) : (
                        <span style={{ padding: "4px 8px", borderRadius: "4px", fontSize: "0.85em", fontWeight: 500, background: "rgba(0, 200, 0, 0.1)", color: "var(--success)", border: "1px solid rgba(0,200,0,0.3)" }}>Aberto</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </AppShell>
  );
}
