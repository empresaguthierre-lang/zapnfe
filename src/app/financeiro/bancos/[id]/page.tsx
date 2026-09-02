import Link from "next/link";
import { notFound } from "next/navigation";
import { FiArrowLeft, FiUpload, FiCheckCircle, FiAlertCircle } from "react-icons/fi";
import { AppShell } from "@/components/app-shell";
import { requireOrganizationMember } from "@/lib/auth/authorization";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency, formatDateTime } from "@/lib/data/format";

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
  
  const { data: transactions } = await supabase
    .from("bank_transactions")
    .select("*")
    .eq("bank_account_id", id)
    .order("posted_on", { ascending: false })
    .limit(50);
    
  const pendingCount = transactions?.filter(t => t.status === "unmatched").length || 0;
  const partialCount = transactions?.filter(t => t.status === "partially_reconciled").length || 0;
  const reconciledCount = transactions?.filter(t => t.status === "reconciled").length || 0;

  return (
    <AppShell active="finance" eyebrow="Conta Bancária" title={account.name} actions={<Link className="secondary-button" href="/financeiro/bancos"><FiArrowLeft /> Voltar aos bancos</Link>}>
      <section className="order-heading">
        <div>
          <h2>{account.bank_code} - {account.bank_name || account.name}</h2>
          <p>Saldo da Conta (Interno): <strong>{formatCurrency(Number(account.opening_balance))}</strong></p>
        </div>
        <button className="primary-button"><FiUpload /> Importar OFX</button>
      </section>

      <div className="status-flow compact-flow" style={{ marginBottom: "24px" }}>
        <div><span>Pendentes</span><strong style={{ color: "var(--danger)" }}>{pendingCount}</strong></div>
        <div><span>Com sugestão</span><strong style={{ color: "var(--warning)" }}>0</strong></div>
        <div><span>Parciais</span><strong>{partialCount}</strong></div>
        <div><span>Conciliados</span><strong style={{ color: "var(--success)" }}>{reconciledCount}</strong></div>
      </div>

      <div className="panel data-panel">
        <div className="data-table">
          <div className="data-row data-header" style={{ gridTemplateColumns: "1fr 2fr 2fr 1fr" }}>
            <span>Data</span><span>Movimento</span><span>Conciliação</span><span style={{ textAlign: "right" }}>Ação</span>
          </div>
          
          {transactions?.length === 0 && (
            <div className="data-row" style={{ display: "block", textAlign: "center", padding: "40px", color: "var(--text-secondary)" }}>
              Nenhuma transação importada para esta conta ainda.
            </div>
          )}
          
          {transactions?.map(tx => (
             <div key={tx.id} className="data-row" style={{ gridTemplateColumns: "1fr 2fr 2fr 1fr" }}>
               <span>{tx.posted_on}</span>
               <div><strong style={{ color: tx.direction === 'credit' ? "var(--success)" : "var(--danger)" }}>{tx.direction === 'credit' ? '+ ' : '- '}{formatCurrency(Number(tx.amount))}</strong><br/><small>{tx.description}</small></div>
               <div>
                 {tx.status === 'unmatched' && <span style={{ color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 4 }}>○ Não classificado</span>}
                 {tx.status === 'partially_reconciled' && <span style={{ color: "var(--warning)", display: "flex", alignItems: "center", gap: 4 }}><FiAlertCircle /> Conciliação Parcial</span>}
                 {tx.status === 'reconciled' && <span style={{ color: "var(--success)", display: "flex", alignItems: "center", gap: 4 }}><FiCheckCircle /> Conciliado</span>}
               </div>
               <div style={{ textAlign: "right" }}><button className={tx.status === 'reconciled' ? "secondary-button" : "primary-button"} style={{ padding: "4px 12px", fontSize: "0.85em" }}>{tx.status === 'reconciled' ? 'Ver' : 'Conciliar'}</button></div>
             </div>
          ))}
          
        </div>
      </div>
    </AppShell>
  );
}