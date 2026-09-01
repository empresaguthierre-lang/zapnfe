"use client";

import { useState, useTransition } from "react";
import { formatCurrency, formatDateTime } from "@/lib/data/format";
import { registerPaymentAction, reversePaymentAction } from "@/app/financeiro/actions";
import { FiDollarSign, FiRefreshCcw, FiX } from "react-icons/fi";
import type { FinanceLookups, ReceivableDetails, ReceivableInstallment, ReceivablePayment } from "@/lib/finance/types";

export function ReceivableDetailClient({ data, lookups }: { data: ReceivableDetails; lookups: FinanceLookups }) {
  const [isPending, startTransition] = useTransition();
  const [receivingInst, setReceivingInst] = useState<ReceivableInstallment | null>(null);
  const [reversingPay, setReversingPay] = useState<ReceivablePayment | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Receive Form State
  const [bankAccountId, setBankAccountId] = useState("");
  const [paymentMethodId, setPaymentMethodId] = useState("");
  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 16));
  const [principal, setPrincipal] = useState("");
  const [interest, setInterest] = useState("0");
  const [penalty, setPenalty] = useState("0");
  const [discount, setDiscount] = useState("0");
  const [reason, setReason] = useState(""); // for reversal

  function handleReceiveSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const installment = receivingInst;
    if (!installment) return;

    const prin = Number(principal);
    if (prin <= 0 || prin > installment.open_amount) {
      setError("O principal deve ser maior que 0 e menor ou igual ao valor em aberto.");
      return;
    }

    startTransition(async () => {
      const res = await registerPaymentAction({
        installmentId: installment.id,
        bankAccountId,
        paymentMethodId: paymentMethodId || undefined,
        principal: prin,
        interest: Number(interest),
        penalty: Number(penalty),
        discount: Number(discount),
        paidAt: new Date(paidAt).toISOString(),
        notes: "Recebimento manual"
      });

      if (!res.ok) {
        setError(res.message ?? "Não foi possível registrar o recebimento.");
      } else {
        setReceivingInst(null);
      }
    });
  }

  function handleReverseSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!reason || reason.length < 5) {
      setError("Informe um motivo válido (min 5 caract).");
      return;
    }
    const payment = reversingPay;
    if (!payment) return;

    startTransition(async () => {
      const res = await reversePaymentAction({
        paymentId: payment.id,
        reason
      });
      if (!res.ok) {
        setError(res.message ?? "Não foi possível estornar o recebimento.");
      } else {
        setReversingPay(null);
        setReason("");
      }
    });
  }

  const installments = [...data.receivable_installments].sort((a, b) => a.installment_number - b.installment_number);

  return (
    <div>
      <h3 style={{ marginBottom: 16 }}>Parcelas e Vencimentos</h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {installments.map((inst) => {
          const isOverdue = new Date(inst.due_on) < new Date() && (inst.status === "open" || inst.status === "partially_paid");

          return (
            <div key={inst.id} className="panel" style={{ padding: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, borderBottom: "1px solid var(--border)", paddingBottom: 16 }}>
                <div>
                  <h4 style={{ margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
                    Parcela {inst.installment_number}/{installments.length}
                    {inst.status === "partially_paid" && <span style={{ fontSize: "0.75em", padding: "2px 6px", background: "rgba(255,165,0,0.1)", color: "var(--warning)", borderRadius: 4 }}>Parcial</span>}
                    {inst.status === "paid" && <span style={{ fontSize: "0.75em", padding: "2px 6px", background: "rgba(0,200,0,0.1)", color: "var(--success)", borderRadius: 4 }}>Paga</span>}
                    {isOverdue && <span style={{ fontSize: "0.75em", padding: "2px 6px", background: "rgba(255,0,0,0.1)", color: "var(--danger)", borderRadius: 4 }}>Vencida</span>}
                  </h4>
                  <p style={{ margin: "4px 0 0 0", color: "var(--text-secondary)", fontSize: "0.9em" }}>
                    Vencimento: <strong>{inst.due_on.split("-").reverse().join("/")}</strong>
                  </p>
                </div>
                <div style={{ textAlign: "right", display: "flex", alignItems: "center", gap: 24 }}>
                  <div>
                    <span style={{ fontSize: "0.8em", color: "var(--text-secondary)", display: "block" }}>Valor Original</span>
                    <strong>{formatCurrency(inst.original_amount)}</strong>
                  </div>
                  <div>
                    <span style={{ fontSize: "0.8em", color: "var(--text-secondary)", display: "block" }}>Em Aberto</span>
                    <strong style={{ color: inst.open_amount > 0 ? "var(--danger)" : "var(--success)" }}>{formatCurrency(inst.open_amount)}</strong>
                  </div>
                  {inst.open_amount > 0 && (
                    <button className="primary-button" style={{ display: "flex", alignItems: "center", gap: 8 }} onClick={() => { setReceivingInst(inst); setPrincipal(String(inst.open_amount)); setError(null); }}>
                      <FiDollarSign /> Receber
                    </button>
                  )}
                </div>
              </div>

              {/* Payments Ledger */}
              {inst.receivable_payments && inst.receivable_payments.length > 0 && (
                <div style={{ background: "var(--bg-body)", padding: 16, borderRadius: 6 }}>
                  <h5 style={{ margin: "0 0 12px 0", color: "var(--text-secondary)" }}>Histórico de Recebimentos da Parcela</h5>
                  <table style={{ width: "100%", fontSize: "0.85em", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "left" }}>
                        <th style={{ padding: "8px 0" }}>Data</th>
                        <th style={{ padding: "8px 0" }}>Tipo</th>
                        <th style={{ padding: "8px 0", textAlign: "right" }}>Principal Abatido</th>
                        <th style={{ padding: "8px 0", textAlign: "right" }}>Total Movimentado</th>
                        <th style={{ padding: "8px 0", textAlign: "right" }}>Ação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...inst.receivable_payments].sort((a, b) => new Date(a.paid_at).getTime() - new Date(b.paid_at).getTime()).map((pay) => {
                        const isReversal = pay.amount < 0 || pay.reversal_of_id;
                        const hasBeenReversed = inst.receivable_payments.some((payment) => payment.reversal_of_id === pay.id);

                        return (
                          <tr key={pay.id} style={{ borderBottom: "1px solid var(--border)", opacity: hasBeenReversed ? 0.5 : 1 }}>
                            <td style={{ padding: "8px 0" }}>{formatDateTime(pay.paid_at)}</td>
                            <td style={{ padding: "8px 0", color: isReversal ? "var(--danger)" : "var(--success)" }}>
                              {isReversal ? "Estorno" : "Recebimento"}
                            </td>
                            <td style={{ padding: "8px 0", textAlign: "right" }}>{formatCurrency(pay.principal_amount)}</td>
                            <td style={{ padding: "8px 0", textAlign: "right", fontWeight: 600 }}>{formatCurrency(pay.amount)}</td>
                            <td style={{ padding: "8px 0", textAlign: "right" }}>
                              {!isReversal && !hasBeenReversed && (
                                <button className="icon-button" style={{ color: "var(--danger)" }} title="Estornar" onClick={() => { setReversingPay(pay); setError(null); }}>
                                  <FiRefreshCcw />
                                </button>
                              )}
                              {hasBeenReversed && <span style={{ color: "var(--danger)", fontWeight: 500 }}>ESTORNADO</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Receive Modal */}
      {receivingInst && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: 500 }}>
            <div className="modal-header">
              <h3>Registrar Recebimento</h3>
              <button className="icon-button" onClick={() => setReceivingInst(null)}><FiX /></button>
            </div>
            <form onSubmit={handleReceiveSubmit}>
              {error && <div className="action-error" style={{ marginBottom: 16 }}>{error}</div>}
              <div style={{ padding: "12px", background: "var(--bg-body)", borderRadius: 6, marginBottom: 16 }}>
                <p style={{ margin: "0 0 4px 0", fontSize: "0.9em" }}>Valor Original: <strong>{formatCurrency(receivingInst.original_amount)}</strong></p>
                <p style={{ margin: 0, fontSize: "0.9em" }}>Em Aberto: <strong style={{ color: "var(--danger)" }}>{formatCurrency(receivingInst.open_amount)}</strong></p>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
                <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span>Data do Pagamento *</span>
                  <input type="datetime-local" value={paidAt} onChange={e => setPaidAt(e.target.value)} required />
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span>Principal Recebido (R$) *</span>
                  <input type="number" step="0.01" min="0.01" max={receivingInst.open_amount} value={principal} onChange={e => setPrincipal(e.target.value)} required />
                </label>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
                <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span style={{ fontSize: "0.85em" }}>Juros (+)</span>
                  <input type="number" step="0.01" min="0" value={interest} onChange={e => setInterest(e.target.value)} />
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span style={{ fontSize: "0.85em" }}>Multa (+)</span>
                  <input type="number" step="0.01" min="0" value={penalty} onChange={e => setPenalty(e.target.value)} />
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span style={{ fontSize: "0.85em" }}>Desconto (-)</span>
                  <input type="number" step="0.01" min="0" value={discount} onChange={e => setDiscount(e.target.value)} />
                </label>
              </div>

              <div style={{ padding: 12, borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)", marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>Total Calculado:</span>
                <strong style={{ fontSize: "1.2em", color: "var(--success)" }}>
                  {formatCurrency(Number(principal) + Number(interest) + Number(penalty) - Number(discount))}
                </strong>
              </div>

              <label style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 16 }}>
                <span>Conta Bancária/Caixa *</span>
                <select value={bankAccountId} onChange={e => setBankAccountId(e.target.value)} required>
                  <option value="">Selecione...</option>
                  {lookups.bankAccounts.map((bankAccount) => <option key={bankAccount.id} value={bankAccount.id}>{bankAccount.account_name}</option>)}
                </select>
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 16 }}>
                <span>Forma de pagamento</span>
                <select value={paymentMethodId} onChange={event => setPaymentMethodId(event.target.value)}>
                  <option value="">Não informada</option>
                  {lookups.paymentMethods.map((method) => <option key={method.id} value={method.id}>{method.name}</option>)}
                </select>
              </label>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button type="button" className="secondary-button" onClick={() => setReceivingInst(null)} disabled={isPending}>Cancelar</button>
                <button type="submit" className="primary-button" disabled={isPending}>{isPending ? "Processando..." : "Confirmar Recebimento"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reverse Modal */}
      {reversingPay && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <h3>Confirmar Estorno</h3>
              <button className="icon-button" onClick={() => setReversingPay(null)}><FiX /></button>
            </div>
            <form onSubmit={handleReverseSubmit}>
              {error && <div className="action-error" style={{ marginBottom: 16 }}>{error}</div>}
              <p style={{ margin: "0 0 16px 0" }}>
                Você está estornando o pagamento de <strong>{formatCurrency(reversingPay.amount)}</strong> realizado em {formatDateTime(reversingPay.paid_at)}. O valor do principal ({formatCurrency(reversingPay.principal_amount)}) retornará para o saldo em aberto da parcela.
              </p>

              <label style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 24 }}>
                <span>Motivo do Estorno *</span>
                <input type="text" value={reason} onChange={e => setReason(e.target.value)} placeholder="Ex: Lançamento duplicado" required minLength={5} />
              </label>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button type="button" className="secondary-button" onClick={() => setReversingPay(null)} disabled={isPending}>Cancelar</button>
                <button type="submit" className="danger-button" disabled={isPending}>{isPending ? "Processando..." : "Confirmar Estorno"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style jsx>{`
        .modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1000; }
        .modal-content { background: var(--bg-card); border: 1px solid var(--border); border-radius: 8px; width: 100%; padding: 24px; box-shadow: 0 10px 25px rgba(0,0,0,0.2); }
        .modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
        .modal-header h3 { margin: 0; }
      `}</style>
    </div>
  );
}
