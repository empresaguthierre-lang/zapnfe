"use client";

import { useMemo, useState } from "react";
import { FiAlertTriangle, FiCheck, FiFileText, FiInfo, FiSave } from "react-icons/fi";
import { formatCurrency, products, type Order, type OrderItem } from "@/lib/demo-data";

function safeNonNegative(value: string) {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export function OrderReview({ order }: { order: Order }) {
  const [items, setItems] = useState(() => order.items.map((item) => ({ ...item })));
  const [discount, setDiscount] = useState(order.discount);
  const [freight, setFreight] = useState(order.freight);
  const [validated, setValidated] = useState(false);

  const subtotal = useMemo(() => items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0), [items]);
  const total = Math.max(0, subtotal - discount + freight);
  const errors = useMemo(() => items.flatMap((item) => {
    const product = products.find((candidate) => candidate.id === item.productId);
    const itemErrors: string[] = [];
    if (!product) itemErrors.push(`${item.description}: selecione um produto do catálogo.`);
    if (item.quantity <= 0) itemErrors.push(`${item.description}: quantidade deve ser maior que zero.`);
    if (item.unitPrice < 0) itemErrors.push(`${item.description}: preço inválido.`);
    if (product && !product.fiscalReady) itemErrors.push(`${product.name}: cadastro fiscal incompleto.`);
    if (item.needsReview) itemErrors.push(`${item.description}: confirme a correspondência sugerida.`);
    return itemErrors;
  }), [items]);

  function updateItem(itemId: string, patch: Partial<OrderItem>) {
    setValidated(false);
    setItems((current) => current.map((item) => item.id === itemId ? { ...item, ...patch } : item));
  }

  function selectProduct(itemId: string, productId: string) {
    const product = products.find((candidate) => candidate.id === productId);
    if (!product) return updateItem(itemId, { productId: null, needsReview: true });
    updateItem(itemId, { productId: product.id, description: product.name, unit: product.unit, unitPrice: product.price, needsReview: false, confidence: 1 });
  }

  function validateReview() {
    if (errors.length === 0) setValidated(true);
  }

  return (
    <div className="review-layout">
      <section className="review-main">
        <div className="review-alert"><FiInfo /><span><strong>Conferência humana obrigatória.</strong> A IA apenas sugere produtos; nenhuma linha é faturada automaticamente.</span></div>
        <article className="panel review-card">
          <div className="panel-header"><div><p className="eyebrow">Itens</p><h3>Conferir pedido</h3></div><span className="phase-badge">{items.length} itens</span></div>
          <div className="review-table">
            <div className="review-row review-header"><span>Produto</span><span>Qtd.</span><span>Un.</span><span>Preço</span><span>Total</span><span>Confiança</span></div>
            {items.map((item) => (
              <div className={`review-row ${item.needsReview || !item.productId ? "needs-review" : ""}`} key={item.id}>
                <div className="product-control"><select aria-label={`Produto para ${item.description}`} value={item.productId ?? ""} onChange={(event) => selectProduct(item.id, event.target.value)}><option value="">Selecionar produto</option>{products.filter((product) => product.active).map((product) => <option value={product.id} key={product.id}>{product.name}</option>)}</select><small>{item.needsReview ? <><FiAlertTriangle /> Revisão necessária</> : "Correspondência confirmada"}</small></div>
                <input aria-label={`Quantidade de ${item.description}`} type="number" min="0.001" step="0.001" value={item.quantity} onChange={(event) => updateItem(item.id, { quantity: safeNonNegative(event.target.value) })} />
                <span>{item.unit}</span>
                <input aria-label={`Preço de ${item.description}`} type="number" min="0" step="0.01" value={item.unitPrice} onChange={(event) => updateItem(item.id, { unitPrice: safeNonNegative(event.target.value) })} />
                <strong>{formatCurrency(item.quantity * item.unitPrice)}</strong>
                <span className={`confidence ${item.confidence >= 0.85 ? "high" : "low"}`}>{Math.round(item.confidence * 100)}%</span>
              </div>
            ))}
          </div>
        </article>

        <article className="panel totals-card">
          <div className="totals-inputs">
            <label><span>Desconto</span><div className="money-input"><span>R$</span><input type="number" min="0" step="0.01" value={discount} onChange={(event) => { setValidated(false); setDiscount(safeNonNegative(event.target.value)); }} /></div></label>
            <label><span>Frete</span><div className="money-input"><span>R$</span><input type="number" min="0" step="0.01" value={freight} onChange={(event) => { setValidated(false); setFreight(safeNonNegative(event.target.value)); }} /></div></label>
          </div>
          <div className="totals-summary"><div><span>Subtotal</span><strong>{formatCurrency(subtotal)}</strong></div><div><span>Desconto</span><strong>- {formatCurrency(discount)}</strong></div><div><span>Frete</span><strong>{formatCurrency(freight)}</strong></div><div className="grand-total"><span>Total</span><strong>{formatCurrency(total)}</strong></div></div>
        </article>
      </section>

      <aside className="review-aside">
        <article className="panel source-card"><div className="panel-header"><div><p className="eyebrow">Origem</p><h3>Mensagem recebida</h3></div></div><blockquote>{order.sourceMessage}</blockquote><p>Confiança geral: <strong>{Math.round(order.confidence * 100)}%</strong></p></article>
        <article className={`panel validation-card ${errors.length === 0 ? "valid" : "invalid"}`}>
          <div className="validation-title">{errors.length === 0 ? <FiCheck /> : <FiAlertTriangle />}<strong>{errors.length === 0 ? "Pedido pronto para validar" : `${errors.length} ajustes pendentes`}</strong></div>
          {errors.length > 0 ? <ul>{errors.map((error) => <li key={error}>{error}</li>)}</ul> : <p>Produtos, quantidades, preços e dados fiscais estão consistentes.</p>}
          {validated ? <div className="local-success"><FiCheck /> Conferência validada nesta sessão demonstrativa.</div> : null}
          <button className="primary-button full-button" type="button" onClick={validateReview} disabled={errors.length > 0}><FiSave /> Validar conferência</button>
          <button className="secondary-button full-button" type="button" disabled title="Disponível após conectar Focus NFe em homologação"><FiFileText /> Aprovar e emitir NF-e</button>
          <small className="integration-note">A validação não grava dados. Persistência e emissão serão habilitadas somente após configurar Supabase e Focus.</small>
        </article>
      </aside>
    </div>
  );
}
