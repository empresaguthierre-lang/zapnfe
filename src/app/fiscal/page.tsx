/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-require-imports */
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { requireOrganizationMember } from "@/lib/auth/authorization";
import { createClient } from "@/lib/supabase/server";
import { FiSettings, FiFileText, FiAlertCircle } from "react-icons/fi";

export const dynamic = "force-dynamic";

export default async function FiscalPage() {
  const member = await requireOrganizationMember();
  const supabase = await createClient();

  const { data: settings } = await supabase
    .from("fiscal_settings")
    .select("*")
    .eq("organization_id", member.organizationId)
    .maybeSingle();

  const { count: invoicesCount } = await supabase
    .from("invoices")
    .select("*", { count: "exact", head: true })
    .eq("organization_id", member.organizationId);

  const { data: invoices } = await supabase
    .from("invoices")
    .select("*, customers(name)")
    .eq("organization_id", member.organizationId)
    .order("created_at", { ascending: false })
    .limit(10);

  return (
    <AppShell active="fiscal" eyebrow="Fiscal" title="Notas Fiscais" actions={<Link className="secondary-button" href="/fiscal/configuracoes"><FiSettings /> Configurar Fiscal</Link>}>
      
      {!settings || !settings.default_provider_id ? (
        <div style={{ marginBottom: 24, padding: "16px", borderRadius: "12px", background: "#fffbeb", border: "1px solid #fde68a", display: "flex", gap: "12px", color: "#92400e" }}>
           <FiAlertCircle size={24} style={{ flexShrink: 0, marginTop: 4 }} />
           <div>
             <strong style={{ fontSize: "14px", display: "block" }}>Configuração fiscal incompleta</strong>
             <p style={{ margin: "4px 0 0 0", fontSize: "13px" }}>O ambiente de emissão não está configurado. Nenhuma NF-e poderá ser emitida até que a organização cadastre o certificado digital e o perfil tributário.</p>
           </div>
        </div>
      ) : null}

      <div className="status-flow compact-flow" style={{ marginBottom: "24px" }}>
        <div><span>Notas Emitidas</span><strong style={{ color: "var(--text)" }}>{invoicesCount || 0}</strong></div>
      </div>

      <div className="panel data-panel">
        <div className="data-table">
          <div className="data-row data-header" style={{ gridTemplateColumns: "1fr 2fr 1fr 1fr" }}>
            <span>Data</span><span>Cliente</span><span>Status</span><span style={{ textAlign: "right" }}>Total</span>
          </div>
          
          {!invoices || invoices.length === 0 ? (
            <div className="data-row" style={{ display: "block", textAlign: "center", padding: "40px", color: "var(--text-secondary)" }}>
              <FiFileText size={32} style={{ opacity: 0.5, marginBottom: 16 }} />
              <p>Nenhuma NF-e registrada.</p>
            </div>
          ) : (
            invoices.map(inv => (
              <div key={inv.id} className="data-row" style={{ gridTemplateColumns: "1fr 2fr 1fr 1fr" }}>
                <span>{new Date(inv.created_at).toLocaleDateString("pt-BR")}</span>
                <div><strong>{(inv.customers as any)?.name}</strong><br/><small>NF-e</small></div>
                <div><span className="phase-badge">{inv.status}</span></div>
                <div style={{ textAlign: "right" }}><strong>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(inv.total_amount)}</strong></div>
              </div>
            ))
          )}
        </div>
      </div>

    </AppShell>
  );
}
