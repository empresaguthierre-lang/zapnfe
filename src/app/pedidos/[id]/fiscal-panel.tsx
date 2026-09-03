/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-require-imports */
"use client";

import Link from "next/link";
import { useTransition } from "react";
import { FiCheckCircle, FiAlertCircle, FiLock, FiAlertTriangle, FiFileText } from "react-icons/fi";
import type { Product } from "@/lib/data/types";
import { prepareInvoiceDraftAction, submitInvoiceAction } from "@/app/pedidos/actions";
import { formatCurrency } from "@/lib/data/format";
import { safeInternalHref } from "@/lib/security/href";

type Issue = {
  code: string;
  severity: string;
  entity?: string;
  entity_id?: string;
  order_item_id?: string;
  message: string;
  action?: { label: string; href: string };
};

type Diagnosis = {
  ready: boolean;
  errors: number;
  warnings: number;
  issues: Issue[];
};

export function FiscalReadinessPanel({ diagnosis, customerName, products, orderId, draftInvoice }: { diagnosis: Diagnosis, customerName: string, products: Product[], orderId: string, draftInvoice: any }) {
  const [isPending, startTransition] = useTransition();
  const issuerIssues = diagnosis.issues.filter(i => i.entity === 'organization');
  const customerIssues = diagnosis.issues.filter(i => i.entity === 'customer' || i.code.startsWith('CUSTOMER'));
  const productIssues = diagnosis.issues.filter(i => i.entity === 'product' || i.code.startsWith('PRODUCT'));
  const otherIssues = diagnosis.issues.filter(i => !['organization', 'customer', 'product'].includes(i.entity || '') && !i.code.startsWith('CUSTOMER') && !i.code.startsWith('PRODUCT'));

  const renderIssues = (issues: Issue[]) => {
    if (issues.length === 0) return null;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 12 }}>
        {issues.map((issue, idx) => (
          <div key={idx} style={{ display: "flex", gap: 8, alignItems: "flex-start", color: issue.severity === 'error' ? "var(--danger)" : "var(--warning)" }}>
            {issue.code === 'CUSTOMER_OPERATION_BLOCKED' ? <FiLock style={{ marginTop: 2 }} /> : (issue.severity === 'error' ? <FiAlertCircle style={{ marginTop: 2 }} /> : <FiAlertTriangle style={{ marginTop: 2 }} />)}
            <div>
              {issue.order_item_id && <strong style={{ display: "block", color: "var(--ink)", fontSize: 13 }}>{products.find(p => p.id === issue.order_item_id)?.name || "Item desconhecido"}</strong>}
              <p style={{ margin: "0 0 6px 0", fontSize: 13 }}>{issue.message}</p>
              {issue.action && (
                <Link href={safeInternalHref(issue.action.href)} className="secondary-button" style={{ padding: "4px 10px", fontSize: 11, minHeight: 0 }}>
                  {issue.action.label}
                </Link>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  };
  
    if (draftInvoice) {
    const isPendingSubmission = draftInvoice.status === 'submission_pending' || draftInvoice.status === 'processing';
    return (
      <div className="panel" style={{ padding: 24, marginTop: 24, borderTop: "4px solid var(--text-secondary)" }}>
        <p className="eyebrow" style={{ margin: "0 0 4px 0" }}>Fiscal</p>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
           <h3 style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--ink)", margin: 0 }}>
             <FiFileText /> {draftInvoice.status === 'draft' ? "DRAFT PREPARADO" : "DOCUMENTO EM PROCESSAMENTO"}
           </h3>
           <Link href={`/fiscal/notas/${draftInvoice.id}`} className="secondary-button">Revisar Documento</Link>
        </div>
        
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 24, background: "#f8fafc", padding: 16, borderRadius: 12 }}>
           <div><small style={{ color: "var(--text-secondary)", display: "block" }}>Revisão</small><strong>{draftInvoice.draft_revision}</strong></div>
           <div><small style={{ color: "var(--text-secondary)", display: "block" }}>Status</small>
             <strong style={{ color: isPendingSubmission ? "var(--warning)" : "inherit" }}>
               {draftInvoice.status.toUpperCase()}
             </strong>
           </div>
           <div><small style={{ color: "var(--text-secondary)", display: "block" }}>Emitente</small><strong>{draftInvoice.issuer_legal_name_snapshot}</strong></div>
           <div><small style={{ color: "var(--text-secondary)", display: "block" }}>Total</small><strong>{formatCurrency(Number(draftInvoice.total_amount))}</strong></div>
        </div>
        
        <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end", gap: 12 }}>
          {draftInvoice.status === 'draft' && (
            <>
              <button className="text-button" onClick={() => startTransition(() => { void prepareInvoiceDraftAction(orderId); })} disabled={isPending}>
                {isPending ? "Regerando..." : "Regerar Revisão"}
              </button>
              <button className="primary-button" onClick={() => startTransition(() => { void submitInvoiceAction(draftInvoice.id, orderId); })} disabled={isPending}>
                {isPending ? "Enfileirando..." : "Transmitir NF-e"}
              </button>
            </>
          )}
        </div>
      </div>
    );
  }  return (
    <div className="panel" style={{ padding: 24, marginTop: 24, borderTop: diagnosis.ready ? "4px solid var(--success)" : "4px solid var(--danger)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div>
           <p className="eyebrow" style={{ margin: "0 0 4px 0" }}>Fiscal</p>
           {diagnosis.ready ? (
             <h3 style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--success)", margin: 0 }}>
               <FiCheckCircle /> Pedido fiscalmente pronto
             </h3>
           ) : (
             <>
               <h3 style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--danger)", margin: 0 }}>
                 <FiAlertCircle /> Pedido não está pronto para faturamento
               </h3>
               <p style={{ margin: "8px 0 0 0", fontSize: 13, color: "var(--text-secondary)" }}>
                 {diagnosis.errors > 0 && <span>{diagnosis.errors} pendência(s) obrigatória(s)</span>}
                 {diagnosis.errors > 0 && diagnosis.warnings > 0 && <span> • </span>}
                 {diagnosis.warnings > 0 && <span>{diagnosis.warnings} alerta(s)</span>}
               </p>
             </>
           )}
        </div>
        
        {diagnosis.ready ? (
           <button className="primary-button" onClick={() => startTransition(() => { void prepareInvoiceDraftAction(orderId); })} disabled={isPending}>
             {isPending ? "Preparando..." : "Preparar NF-e"}
           </button>
        ) : (
           <button className="primary-button" disabled>Preparar NF-e</button>
        )}
      </div>
      
      {!diagnosis.ready && (
        <div style={{ borderTop: "1px solid var(--line)", paddingTop: 20 }}>
          
          {issuerIssues.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <h4 style={{ margin: 0, textTransform: "uppercase", fontSize: 12, color: "var(--text-secondary)", letterSpacing: "0.5px" }}>Emitente</h4>`n              {renderIssues(issuerIssues)}
            </div>
          )}
          
          {customerIssues.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <h4 style={{ margin: 0, textTransform: "uppercase", fontSize: 12, color: "var(--text-secondary)", letterSpacing: "0.5px" }}>Cliente — {customerName}</h4>
              {renderIssues(otherIssues)}
            </div>
          )}
          
          {productIssues.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <h4 style={{ margin: 0, textTransform: "uppercase", fontSize: 12, color: "var(--text-secondary)", letterSpacing: "0.5px" }}>Produtos</h4>`n              {renderIssues(productIssues)}
            </div>
          )}
          
          {otherIssues.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <h4 style={{ margin: 0, textTransform: "uppercase", fontSize: 12, color: "var(--text-secondary)", letterSpacing: "0.5px" }}>Pedido</h4>
              {renderIssues(otherIssues)}
            </div>
          )}
          
        </div>
      )}
      
      {diagnosis.ready && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 16, marginTop: 24, paddingTop: 24, borderTop: "1px solid var(--line)" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}><FiCheckCircle color="var(--success)" /> <span style={{ fontSize: 13 }}>Emitente Completo</span></div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}><FiCheckCircle color="var(--success)" /> <span style={{ fontSize: 13 }}>Cliente Completo</span></div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}><FiCheckCircle color="var(--success)" /> <span style={{ fontSize: 13 }}>Produtos Válidos</span></div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}><FiCheckCircle color="var(--success)" /> <span style={{ fontSize: 13 }}>Nenhum bloqueio</span></div>
        </div>
      )}
      
    </div>
  );
}




