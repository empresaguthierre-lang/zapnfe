"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FiAlertTriangle, FiCheck, FiFileText, FiInfo, FiSave } from "react-icons/fi";
import { saveOrderReviewAction } from "@/app/pedidos/actions";
import { formatCurrency } from "@/lib/data/format";
import type { OrderDetail, OrderItem, Product } from "@/lib/data/types";

function safeNonNegative(value: string) {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export function OrderReview({ order, products }: { order: OrderDetail; products: Product[] }) {
  const router = useRouter();
  const [items, setItems] = useState(() => order.items.map((item) => ({ ...item })));
  const [discount, setDiscount] = useState(order.discount);
  const [freight, setFreight] = useState(order.freight);
  const [notes, setNotes] = useState(order.notes);
  const [savedVersion, setSavedVersion] = useState(order.updatedAt);
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const locked = ["approved", "invoiced", "completed", "cancelled"].includes(order.status);

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

  function persist(approve: boolean) {
    if (approve && errors.length > 0) return;
    setFeedback(null);
    startTransition(async () => {
      const result = await saveOrderReviewAction({
        orderId: order.id,
        expectedUpdatedAt: savedVersion,
        items: items.map((item) => ({ id: item.id, productId: item.productId, quantity: item.quantity, unitPrice: item.unitPrice, confirmed: !item.needsReview && Boolean(item.productId) })),
        discount,
        freight,
        notes,
        approve,
      });
      if (!result.ok) return setFeedback({ kind: "error", text: result.message });
      setSavedVersion(result.updatedAt);
      setFeedback({ kind: "success", text: result.status === "approved" ? "Pedido aprovado e pronto para faturar." : "Conferência salva no Supabase." });
      router.refresh();
    });
  }

  return (
    <div className="review-layout">
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
        <article className="panel source-card"><div className="panel-header"><div><p className="eyebrow">Origem</p><h3>Mensagem recebida</h3></div></div><blockquote>{order.sourceMessage || "Mensagem sem conteúdo textual."}</blockquote><p>Confiança geral: <strong>{Math.round(order.confidence * 100)}%</strong>{order.customerPhone ? ` · ${order.customerPhone}` : ""}</p></article>
        <article className={`panel validation-card ${errors.length === 0 ? "valid" : "invalid"}`}>
          <div className="validation-title">{errors.length === 0 ? <FiCheck /> : <FiAlertTriangle />}<strong>{errors.length === 0 ? "Pedido pronto para salvar" : `${errors.length} ajustes pendentes`}</strong></div>
          {errors.length > 0 ? <ul>{errors.map((error) => <li key={error}>{error}</li>)}</ul> : <p>Produtos, quantidades e preços estão consistentes para aprovação.</p>}
          {feedback ? <div className={feedback.kind === "success" ? "local-success" : "action-error"}>{feedback.kind === "success" ? <FiCheck /> : <FiAlertTriangle />}{feedback.text}</div> : null}
          <button className="primary-button full-button" type="button" onClick={() => persist(false)} disabled={isPending || locked}><FiSave /> {isPending ? "Salvando..." : "Salvar conferência"}</button>
          <button className="secondary-button full-button" type="button" onClick={() => persist(true)} disabled={errors.length > 0 || isPending || locked}><FiFileText /> Aprovar pedido</button>
          <small className="integration-note">{locked ? "Este pedido está bloqueado para conferência por já estar aprovado ou encerrado. " : "Você pode salvar uma conferência parcial; a aprovação exige todos os itens confirmados. "}A emissão de NF-e continua separada e só será habilitada com a integração fiscal.</small>
        </article>
      </aside>
    </div>
  );
}
