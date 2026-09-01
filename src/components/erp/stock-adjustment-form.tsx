"use client";

import { useActionState } from "react";
import { adjustStockAction } from "@/app/estoque/actions";
import type { SelectOption } from "@/lib/erp/shared/types";
import { SubmitButton } from "./submit-button";

export function StockAdjustmentForm({ warehouses, products, selectedProduct }: { warehouses: SelectOption[]; products: SelectOption[]; selectedProduct?: string }) {
  const [state, action] = useActionState(adjustStockAction, null);
  return <form action={action} className="erp-form erp-compact-form panel">
    <div><p className="eyebrow">Livro de estoque</p><h3>Registrar ajuste</h3><p>O saldo nunca é editado diretamente; toda alteração gera uma movimentação auditável.</p></div>
    <div className="erp-form-grid">
      <label><span>Depósito *</span><select name="warehouseId" required defaultValue=""><option value="" disabled>Selecione</option>{warehouses.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
      <label className="wide"><span>Produto *</span><select name="productId" required defaultValue={selectedProduct ?? ""}><option value="" disabled>Selecione</option>{products.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
      <label><span>Operação *</span><select name="adjustmentType" defaultValue="adjustment_in"><option value="opening_balance">Saldo inicial</option><option value="adjustment_in">Entrada de ajuste</option><option value="adjustment_out">Saída de ajuste</option></select></label>
      <label><span>Quantidade *</span><input name="quantity" type="number" min="0.001" step="0.001" required /></label>
      <label><span>Custo unitário</span><input name="unitCost" type="number" min="0" step="0.01" /></label>
      <label className="wide"><span>Observação</span><input name="notes" maxLength={1000} placeholder="Motivo ou referência interna" /></label>
    </div>
    {state ? <p className={`erp-feedback ${state.ok ? "success" : "error"}`} role="status">{state.message}</p> : null}
    <SubmitButton pendingLabel="Registrando...">Registrar movimentação</SubmitButton>
  </form>;
}
