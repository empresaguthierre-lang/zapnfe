import Link from "next/link";
import { notFound } from "next/navigation";
import { FiArrowLeft, FiInfo, FiFileText } from "react-icons/fi";
import { AppShell } from "@/components/app-shell";
import { requireOrganizationMember } from "@/lib/auth/authorization";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency, formatDateTime } from "@/lib/data/format";

export const dynamic = "force-dynamic";

export default async function InvoiceDraftPage({ params }: { params: Promise<{ id: string }> }) {
  const member = await requireOrganizationMember();
  const { id } = await params;
  const supabase = await createClient();

  const { data: invoice } = await supabase
    .from("invoices")
    .select("*, orders(number)")
    .eq("id", id)
    .eq("organization_id", member.organizationId)
    .maybeSingle();

  if (!invoice) notFound();

  const { data: items } = await supabase
    .from("invoice_items")
    .select("*")
    .eq("invoice_id", id)
    .order("item_sequence", { ascending: true });

  const { data: events } = await supabase
    .from("invoice_events")
    .select("*, created_by_user:created_by(email)")
    .eq("invoice_id", id)
    .order("event_date", { ascending: true });

  const { data: outboxJob } = await supabase
    .from("outbox_jobs")
    .select("*")
    .eq("entity_id", id)
    .in("status", ["pending", "processing"])
    .limit(1)
    .maybeSingle();

  const orderNumber = (invoice.orders as any)?.number;

  return (
    <AppShell active="fiscal" eyebrow="NF-e" title="Draft Fiscal" actions={
      <Link className="secondary-button" href={invoice.order_id ? `/pedidos/${invoice.order_id}` : "/fiscal"}>
        <FiArrowLeft /> {invoice.order_id ? `Voltar ao Pedido #${orderNumber}` : "Voltar"}
      </Link>
    }>

      <div style={{ marginBottom: 24, padding: "16px", borderRadius: "12px", background: "#f0f9ff", border: "1px solid #bae6fd", display: "flex", gap: "12px", color: "#0369a1" }}>
         <FiInfo size={24} style={{ flexShrink: 0, marginTop: 4 }} />
         <div>
           <strong style={{ fontSize: "14px", display: "block" }}>Snapshot Imutável</strong>
           <p style={{ margin: "4px 0 0 0", fontSize: "13px" }}>
             Os dados deste documento representam a verdade no momento da preparação (Revisão {invoice.draft_revision}).
             Não é possível edição inline. Se houver divergências, corrija o cadastro de origem e gere uma nova revisão a partir do pedido.
           </p>
         </div>
      </div>

      <div className="panel" style={{ padding: 24, marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <h3 style={{ display: "flex", alignItems: "center", gap: 8, margin: "0 0 16px 0", color: "var(--ink)" }}>
             <FiFileText /> Draft — {invoice.status.toUpperCase()}
          </h3>
          <div style={{ textAlign: "right" }}>
            <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>Revisão</span>
            <strong style={{ display: "block", fontSize: 20 }}>{invoice.draft_revision}</strong>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32 }}>
           <div>
             <h4 style={{ margin: "0 0 12px 0", fontSize: 13, textTransform: "uppercase", color: "var(--text-secondary)", letterSpacing: "0.5px" }}>Emitente</h4>
             <p style={{ margin: "0 0 4px 0" }}><strong>{invoice.issuer_legal_name_snapshot || "—"}</strong></p>
             <p style={{ margin: "0 0 4px 0", fontSize: 13 }}>
               CNPJ: {invoice.issuer_cnpj_snapshot || "—"}
               {invoice.issuer_ie_snapshot && <> • IE: {invoice.issuer_ie_snapshot}</>}
             </p>
             <p style={{ margin: 0, fontSize: 13, color: "var(--text-secondary)" }}>Regime: {invoice.issuer_tax_regime_snapshot || "—"}</p>
             {invoice.issuer_address_snapshot && (
               <p style={{ margin: "8px 0 0 0", fontSize: 12, color: "var(--text-secondary)" }}>
                 {invoice.issuer_address_snapshot.street}, {invoice.issuer_address_snapshot.number} — {invoice.issuer_address_snapshot.district}, {invoice.issuer_address_snapshot.city}/{invoice.issuer_address_snapshot.state}
               </p>
             )}
           </div>

           <div>
             <h4 style={{ margin: "0 0 12px 0", fontSize: 13, textTransform: "uppercase", color: "var(--text-secondary)", letterSpacing: "0.5px" }}>Destinatário</h4>
             <p style={{ margin: "0 0 4px 0" }}><strong>{invoice.recipient_name_snapshot || "—"}</strong></p>
             <p style={{ margin: "0 0 4px 0", fontSize: 13 }}>
               Documento: {invoice.recipient_document_snapshot || "—"}
               {invoice.recipient_ie_snapshot && <> • IE: {invoice.recipient_ie_snapshot}</>}
             </p>
             <p style={{ margin: 0, fontSize: 13, color: "var(--text-secondary)" }}>
                {invoice.recipient_final_consumer_snapshot ? "Consumidor Final" : "Contribuinte"}
             </p>
             {invoice.recipient_address_snapshot && (
               <p style={{ margin: "8px 0 0 0", fontSize: 12, color: "var(--text-secondary)" }}>
                 {invoice.recipient_address_snapshot.street}, {invoice.recipient_address_snapshot.number} — {invoice.recipient_address_snapshot.district}, {invoice.recipient_address_snapshot.city}/{invoice.recipient_address_snapshot.state}
               </p>
             )}
           </div>
        </div>
      </div>

      <div className="panel data-panel" style={{ marginBottom: 24 }}>
        <div className="data-table">
          <div className="data-row data-header" style={{ gridTemplateColumns: "0.5fr 3fr 1fr 1fr 1fr" }}>
            <span>#</span><span>Produto</span><span>Qtd</span><span>V. Unitário</span><span style={{ textAlign: "right" }}>Total</span>
          </div>

          {items?.map(item => (
             <div key={item.id} className="data-row" style={{ gridTemplateColumns: "0.5fr 3fr 1fr 1fr 1fr" }}>
               <span style={{ color: "var(--text-secondary)" }}>{item.item_sequence}</span>
               <div>
                 <strong>{item.description_snapshot}</strong>
                 <br/><small style={{ color: "var(--text-secondary)" }}>SKU: {item.sku_snapshot || "—"} • NCM: {item.ncm_snapshot || "N/I"} • CFOP: {item.cfop_snapshot || "N/I"}</small>
               </div>
               <div>{item.quantity}</div>
               <div>{formatCurrency(Number(item.unit_price))}</div>
               <div style={{ textAlign: "right" }}><strong>{formatCurrency(Number(item.total_price))}</strong></div>
             </div>
          ))}

          <div className="data-row" style={{ gridTemplateColumns: "1fr", background: "#f8fafc" }}>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 32, padding: "8px 0" }}>
              <div style={{ textAlign: "right" }}>
                <small style={{ color: "var(--text-secondary)" }}>Produtos</small>
                <div style={{ fontSize: 16 }}>{formatCurrency(Number(invoice.products_amount || 0))}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <small style={{ color: "var(--text-secondary)" }}>Frete</small>
                <div style={{ fontSize: 16 }}>{formatCurrency(Number(invoice.total_freight || 0))}</div>
              </div>
              <div style={{ textAlign: "right", color: "var(--danger)" }}>
                <small>Desconto</small>
                <div style={{ fontSize: 16 }}>-{formatCurrency(Number(invoice.total_discounts || 0))}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <small style={{ color: "var(--text-secondary)", fontWeight: 700 }}>Total NF-e</small>
                <div style={{ fontSize: 18, fontWeight: 700 }}>{formatCurrency(Number(invoice.total_amount))}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="panel" style={{ padding: 24, marginBottom: 24, border: "2px solid #e2e8f0" }}>
        <h4 style={{ margin: "0 0 16px 0", fontSize: 13, textTransform: "uppercase", color: "var(--ink)", letterSpacing: "0.5px", display: "flex", justifyContent: "space-between" }}>
          Processamento Fiscal (Technical Dashboard)
          {invoice.status === "rejected" && <span style={{ color: "var(--danger)" }}>Rejeitado</span>}
          {invoice.status === "authorized" && <span style={{ color: "#16a34a" }}>Autorizado</span>}
        </h4>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, fontSize: 13 }}>
          <div>
            <span style={{ color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Status</span>
            <strong>{invoice.status}</strong>
          </div>
          <div>
            <span style={{ color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Provider</span>
            <strong>Focus NFe {process.env.FOCUS_NFE_API_TOKEN ? "(Real)" : "(Mock)"}</strong>
          </div>
          <div>
            <span style={{ color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Ambiente</span>
            <strong>Homologação</strong>
          </div>
          <div>
            <span style={{ color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Referência</span>
            <strong style={{ fontFamily: "monospace" }}>{invoice.provider_reference || "N/A"}</strong>
          </div>
          <div>
            <span style={{ color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Chave / Protocolo</span>
            <strong style={{ fontFamily: "monospace" }}>{invoice.provider_access_key || "N/A"} <br/> {invoice.provider_authorization_protocol || ""}</strong>
          </div>
          {outboxJob && (
            <div style={{ background: "#f8fafc", padding: 8, borderRadius: 6, gridColumn: "span 3", display: "flex", gap: 16 }}>
              <div>
                <span style={{ color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Fila (Outbox)</span>
                <strong>{outboxJob.job_type} ({outboxJob.status})</strong>
              </div>
              <div>
                <span style={{ color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Tentativas</span>
                <strong>{outboxJob.attempts} / {outboxJob.max_attempts}</strong>
              </div>
              <div>
                <span style={{ color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Próxima</span>
                <strong>{formatDateTime(outboxJob.available_at)}</strong>
              </div>
            </div>
          )}
        </div>
      </div>

      {events && events.length > 0 && (
        <div className="panel" style={{ padding: 24 }}>
          <h4 style={{ margin: "0 0 16px 0", fontSize: 13, textTransform: "uppercase", color: "var(--text-secondary)", letterSpacing: "0.5px" }}>Histórico de Eventos</h4>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {events.map(evt => (
              <div key={evt.id} style={{ display: "flex", gap: 12, alignItems: "flex-start", paddingBottom: 12, borderBottom: "1px solid var(--line)" }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--text-secondary)", marginTop: 6, flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <strong style={{ fontSize: 13 }}>{evt.event_type}</strong>
                    <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{formatDateTime(evt.event_date)}</span>
                  </div>
                  <p style={{ margin: "4px 0 0 0", fontSize: 13 }}>
                    {evt.description} <span style={{ color: "var(--text-secondary)", fontSize: 12 }}>— {(evt as any).created_by_user?.email || "Sistema"}</span>
                  </p>
                  {(evt as any).provider_response && (
                    <pre style={{ margin: "8px 0 0 0", padding: "8px", background: "#f8fafc", borderRadius: 4, fontSize: 11, color: "var(--text-secondary)", overflowX: "auto" }}>
                      {JSON.stringify((evt as any).provider_response, null, 2)}
                    </pre>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

    </AppShell>
  );
}
