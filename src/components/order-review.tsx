"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FiAlertTriangle, FiCheck, FiFileText, FiInfo, FiSave, FiXCircle, FiDollarSign } from "react-icons/fi";
import { saveOrderReviewAction, cancelOrderAction, generateFinanceFromOrderAction } from "@/app/pedidos/actions";
import { formatCurrency } from "@/lib/data/format";
import type { OrderDetail, OrderItem, Product } from "@/lib/data/types";
import { ReallocationModal } from "@/components/erp/reallocation-modal";
import Link from "next/link";

type CreditRiskFactor = { code?: string; label: string };
type CreditExposure = {
  credit_limit: number | null;
  open_receivables: number;
  projected_exposure: number;
  excess_amount: number;
  risk?: { level: string; factors?: CreditRiskFactor[] };
};

function safeNonNegative(value: string) {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export function OrderReview({ order, products, creditExposure }: { order: OrderDetail; products: Product[]; creditExposure?: CreditExposure | null }) {
  const router = useRouter();
  const [items, setItems] = useState(() => order.items.map((item) => ({ ...item })));
  const [discount, setDiscount] = useState(order.discount);
  const [freight, setFreight] = useState(order.freight);
  const [notes, setNotes] = useState(order.notes);
  const [savedVersion, setSavedVersion] = useState(order.updatedAt);
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const locked = ["approved", "invoiced", "completed", "cancelled"].includes(order.status);
  const canCancel = !["invoiced", "completed", "cancelled"].includes(order.status);

  // Finance integration
  const isApproved = order.status === "approved" || order.status === "invoiced" || order.status === "completed";
  const financeGenerated = order.financial_status !== "not_generated" && order.financial_status !== undefined;
  const riskFactors = creditExposure?.risk?.factors ?? [];

  const [reallocationModal, setReallocationModal] = useState<{ productId: string, productName: string, targetOrderItemId: string, neededQuantity: number } | null>(null);

  const activeProducts = useMemo(() => products.filter((product) => product.active), [products]);
  const subtotal = useMemo(() => items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0), [items]);
  const total = Math.max(0, subtotal - discount + freight);
  const errors = useMemo(() => items.flatMap((item) => {
    const product = products.find((candidate) => candidate.id === item.productId);
    const itemErrors: string[] = [];
    if (!product || !product.active) itemErrors.push(`${item.description}: selecione um produto ativo do catálogo.`);
    if (item.quantity <= 0) itemErrors.push(`${item.description}: quantidade deve ser maior que zero.`);
    if (item.unitPrice < 0) itemErrors.push(`${item.description}: preço inválido.`);
    if (item.needsReview) itemErrors.push(`${item.description}: confirme a correspondência sugerida.`);
    return itemErrors;
  }), [items, products]);

  function updateItem(itemId: string, patch: Partial<OrderItem>) {
    setFeedback(null);
    setItems((current) => current.map((item) => item.id === itemId ? { ...item, ...patch } : item));
  }

  function selectProduct(itemId: string, productId: string) {
    const product = products.find((candidate) => candidate.id === productId && candidate.active);
    if (!product) return updateItem(itemId, { productId: null, needsReview: true });
    updateItem(itemId, { productId: product.id, description: product.name, unit: product.unit, unitPrice: product.price, needsReview: false, confidence: 1 });
  }

  function persist(approve: boolean, forceApproval = false) {
    if (approve && errors.length > 0) return;

    // Check credit limit early before approving
    if (approve && !forceApproval && creditExposure && creditExposure.excess_amount > 0) {
      if (!confirm(`O cliente excederá o limite de crédito em ${formatCurrency(creditExposure.excess_amount)}. Deseja forçar a aprovação financeira?`)) {
        return;
      }
    }

    setFeedback(null);
    startTransition(async () => {
      const result = await saveOrderReviewAction({
        orderId: order.id,
        expectedUpdatedAt: savedVersion,
        items: items.map((item) => ({ id: item.id, productId: item.productId, quantity: item.quantity, unitPrice: item.unitPrice, confirmed: !item.needsReview })),
        discount,
        freight,
        notes,
        approve,
        forceApproval
      });

      if (!result.ok) {
        if (result.isInsufficientStock) {
          const pName = result.message.split("Em falta:")[1]?.trim();
          const p = products.find(prod => prod.name === pName);
          const i = items.find(it => it.productId === p?.id);
          if (p && i) {
            setReallocationModal({ productId: p.id, productName: p.name, targetOrderItemId: i.id, neededQuantity: i.quantity });
            return;
          }
        }
        return setFeedback({ kind: "error", text: result.message });
      }

      setSavedVersion(result.updatedAt);
      setReallocationModal(null);
      setFeedback({
        kind: "success",
        text: result.status === "approved"
          ? (result.stockStatus === "partial" ? "Pedido aprovado com Reserva Parcial." : "Pedido aprovado e pronto para faturar.")
          : "Conferência salva no Supabase."
      });
      router.refresh();
    });
  }

  function handleCancel() {
    if (!confirm("Tem certeza que deseja cancelar este pedido? Essa ação não poderá ser desfeita.")) return;
    setFeedback(null);
    startTransition(async () => {
      const result = await cancelOrderAction(order.id);
      if (!result.ok) return setFeedback({ kind: "error", text: result.message ?? "Erro desconhecido." });
      setFeedback({ kind: "success", text: "Pedido cancelado com sucesso." });
      router.refresh();
    });
  }

  function handleGenerateFinance() {
    if (!confirm("Gerar Contas a Receber para este pedido?")) return;
    setFeedback(null);
    startTransition(async () => {
      const result = await generateFinanceFromOrderAction(order.id);
      if (!result.ok) return setFeedback({ kind: "error", text: result.message ?? "Erro ao gerar." });
      setFeedback({ kind: "success", text: "Financeiro gerado com sucesso." });
      router.refresh();
    });
  }

  return (
    <div className="review-layout">
      {reallocationModal && (
        <ReallocationModal
          productId={reallocationModal.productId}
          productName={reallocationModal.productName}
          targetOrder={order}
          targetOrderItemId={reallocationModal.targetOrderItemId}
          neededQuantity={reallocationModal.neededQuantity}
          onClose={() => setReallocationModal(null)}
          onReallocated={() => persist(true, false)}
          onForceApprove={() => persist(true, true)}
        />
      )}
      <section className="review-main">
        <div className="review-alert"><FiInfo /><span><strong>Conferência humana obrigatória.</strong> A IA sugere os itens, mas qualquer correção e aprovação fica registrada no pedido.</span></div>
        <article className="panel review-card">
          <div className="panel-header"><div><p className="eyebrow">Itens</p><h3>Conferir pedido</h3></div><span className="phase-badge">{items.length} itens</span></div>
          <div className="review-table">
            <div className="review-row review-header"><span>Produto</span><span>Qtd.</span><span>Un.</span><span>Preço</span><span>Total</span><span>Confiança</span></div>
            {items.map((item) => (
              <div className={`review-row ${item.needsReview || !item.productId ? "needs-review" : ""}`} key={item.id}>
                <div className="product-control"><select aria-label={`Produto para ${item.description}`} value={item.productId ?? ""} onChange={(event) => selectProduct(item.id, event.target.value)} disabled={isPending || locked}><option value="">Selecionar produto</option>{activeProducts.map((product) => <option value={product.id} key={product.id}>{product.name}</option>)}</select><small>{item.needsReview ? <><FiAlertTriangle /> Revisão necessária</> : "Correspondência confirmada"}</small></div>
                <input aria-label={`Quantidade de ${item.description}`} type="number" min="0.001" step="0.001" value={item.quantity} disabled={isPending || locked} onChange={(event) => updateItem(item.id, { quantity: safeNonNegative(event.target.value) })} />
                <span>{item.unit}</span>
                <input aria-label={`Preço de ${item.description}`} type="number" min="0" step="0.01" value={item.unitPrice} disabled={isPending || locked} onChange={(event) => updateItem(item.id, { unitPrice: safeNonNegative(event.target.value) })} />
                <strong>{formatCurrency(item.quantity * item.unitPrice)}</strong>
                <span className={`confidence ${item.confidence >= 0.85 ? "high" : "low"}`}>{Math.round(item.confidence * 100)}%</span>
              </div>
            ))}
          </div>
        </article>

        <article className="panel totals-card">
          <div className="totals-inputs">
            <label><span>Desconto</span><div className="money-input"><span>R$</span><input type="number" min="0" step="0.01" value={discount} disabled={isPending || locked} onChange={(event) => { setFeedback(null); setDiscount(safeNonNegative(event.target.value)); }} /></div></label>
            <label><span>Frete</span><div className="money-input"><span>R$</span><input type="number" min="0" step="0.01" value={freight} disabled={isPending || locked} onChange={(event) => { setFeedback(null); setFreight(safeNonNegative(event.target.value)); }} /></div></label>
            <label className="review-notes"><span>Observações</span><textarea value={notes} maxLength={1000} disabled={isPending || locked} onChange={(event) => { setFeedback(null); setNotes(event.target.value); }} placeholder="Observações internas da conferência" /></label>
          </div>
          <div className="totals-summary"><div><span>Subtotal</span><strong>{formatCurrency(subtotal)}</strong></div><div><span>Desconto</span><strong>- {formatCurrency(discount)}</strong></div><div><span>Frete</span><strong>{formatCurrency(freight)}</strong></div><div className="grand-total"><span>Total</span><strong>{formatCurrency(total)}</strong></div></div>
        </article>
      </section>

      <aside className="review-aside">

        {creditExposure && (
          <article className="panel" style={{ border: creditExposure.excess_amount > 0 ? "1px solid var(--danger)" : "1px solid var(--border)" }}>
            <div className="panel-header">
              <div><p className="eyebrow">Saúde Financeira</p><h3>Risco de Crédito</h3></div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: "0.9em" }}>
              <span>Limite de crédito</span>
              <strong>{creditExposure.credit_limit ? formatCurrency(creditExposure.credit_limit) : "Sem limite"}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: "0.9em" }}>
              <span>Já comprometido</span>
              <strong>{formatCurrency(creditExposure.open_receivables)}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: "0.9em" }}>
              <span>Este pedido</span>
              <strong>{formatCurrency(total)}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderTop: "1px solid var(--border)" }}>
              <span>Exposição Projetada</span>
              <strong>{formatCurrency(creditExposure.projected_exposure)}</strong>
            </div>

            {creditExposure.excess_amount > 0 && (
              <div style={{ background: "rgba(255,0,0,0.1)", color: "var(--danger)", padding: 12, borderRadius: 6, fontSize: "0.9em", marginTop: 8, fontWeight: 500 }}>
                <FiAlertTriangle /> {formatCurrency(creditExposure.excess_amount)} acima do limite
              </div>
            )}

            {creditExposure.risk && riskFactors.length > 0 && (
              <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
                <strong style={{ fontSize: "0.9em" }}>Comportamento {creditExposure.risk.level === "attention" ? "🟡 Atenção" : creditExposure.risk.level === "critical" ? "🔴 Crítico" : "🟢 Regular"}</strong>
                <ul style={{ margin: "8px 0 0 0", paddingLeft: 16, fontSize: "0.85em", color: "var(--text-secondary)" }}>
                  {riskFactors.map((factor, index) => <li key={`${factor.code ?? "risk"}-${index}`}>{factor.label}</li>)}
                </ul>
                <div style={{ marginTop: 12 }}>
                  <Link href={`/clientes/${order.customerId}`} style={{ fontSize: "0.85em", color: "var(--primary)", textDecoration: "none" }}>Ver financeiro do cliente →</Link>
                </div>
              </div>
            )}
          </article>
        )}

        {isApproved && (
          <article className="panel" style={{ border: "1px solid var(--primary-border)" }}>
            <div className="panel-header">
              <div><p className="eyebrow">Financeiro</p><h3>Contas a Receber</h3></div>
            </div>
            <p style={{ margin: "0 0 16px 0", fontSize: "0.9em", color: "var(--text-secondary)" }}>
              O pedido está aprovado. O faturamento gera as contas a receber para este pedido no financeiro.
            </p>

            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12, fontSize: "0.9em" }}>
              <span>Situação</span>
              <strong>{financeGenerated ? "Gerado" : "Não gerado"}</strong>
            </div>

            {financeGenerated ? (
              <Link href="/financeiro/receber" className="primary-button full-button" style={{ textAlign: "center", textDecoration: "none" }}>Ver Financeiro</Link>
            ) : (
              <button className="primary-button full-button" type="button" onClick={handleGenerateFinance} disabled={isPending}>
                <FiDollarSign /> {isPending ? "Processando..." : "Gerar Financeiro"}
              </button>
            )}
          </article>
        )}

        <article className={`panel validation-card ${errors.length === 0 ? "valid" : "invalid"}`}>
          <div className="validation-title">{errors.length === 0 ? <FiCheck /> : <FiAlertTriangle />}<strong>{errors.length === 0 ? "Pedido pronto para salvar" : `${errors.length} ajustes pendentes`}</strong></div>
          {errors.length > 0 ? <ul>{errors.map((error) => <li key={error}>{error}</li>)}</ul> : <p>Produtos, quantidades e preços estão consistentes para aprovação.</p>}
          {feedback ? <div className={feedback.kind === "success" ? "local-success" : "action-error"}>{feedback.kind === "success" ? <FiCheck /> : <FiAlertTriangle />}{feedback.text}</div> : null}
          {!locked && <button className="primary-button full-button" type="button" onClick={() => persist(false)} disabled={isPending || locked}><FiSave /> {isPending ? "Salvando..." : "Salvar conferência"}</button>}
          {!locked && <button className="secondary-button full-button" type="button" onClick={() => persist(true)} disabled={errors.length > 0 || isPending || locked}><FiFileText /> Aprovar pedido e Reservar Estoque</button>}
          {canCancel && <button className="secondary-button danger-button full-button" type="button" onClick={handleCancel} disabled={isPending}><FiXCircle /> Cancelar Pedido</button>}
        </article>
      </aside>
    </div>
  );
}
