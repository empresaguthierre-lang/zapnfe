import Link from "next/link";
import { FiBriefcase, FiChevronRight } from "react-icons/fi";
import { AppShell } from "@/components/app-shell";
import { requireOrganizationMember } from "@/lib/auth/authorization";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency } from "@/lib/data/format";

export const dynamic = "force-dynamic";

export default async function BancosPage() {
  const member = await requireOrganizationMember();
  const supabase = await createClient();

  const { data: accounts } = await supabase
    .from("bank_accounts")
    .select("id, name, bank_code, bank_name, account_number")
    .eq("organization_id", member.organizationId);

  // MOCKED aggregates for now (In real life this comes from SUM(bank_transactions.remaining_amount) and count)

  return (
    <AppShell active="finance" eyebrow="Financeiro" title="Bancos e Conciliação" actions={<Link className="secondary-button" href="/financeiro/conciliacao">Central de Conciliação</Link>}>
      <section className="page-intro">
        <div>
          <h2>Suas Contas Bancárias</h2>
          <p>Importe OFX e concilie os recebimentos com o Financeiro.</p>
        </div>
        <button className="primary-button" type="button" disabled title="Em breve"><FiBriefcase /> Nova Conta</button>
      </section>

      <div className="panel data-panel" style={{ display: "grid", gap: "16px", padding: "16px", background: "transparent", border: "none" }}>
        {(accounts || []).map(acc => (
          <Link href={`/financeiro/bancos/${acc.id}`} key={acc.id} className="panel review-card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", textDecoration: "none", color: "inherit", padding: "24px" }}>
            <div>
              <h3 style={{ margin: "0 0 8px 0" }}>{acc.bank_code} - {acc.bank_name || acc.name}</h3>
              <p style={{ margin: 0, fontSize: "0.9em", color: "var(--text-secondary)" }}>Conta {acc.account_number || "Matriz"} • Última importação: Ontem 15:30</p>
            </div>

            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: "0.85em", color: "var(--danger)", marginBottom: 4 }}>12 pendências</div>
              <strong style={{ fontSize: "1.2em" }}>{formatCurrency(428291.00)}</strong>
            </div>

            <FiChevronRight style={{ color: "var(--text-secondary)", fontSize: "1.2em", marginLeft: "16px" }} />
          </Link>
        ))}
      </div>
    </AppShell>
  );
}
