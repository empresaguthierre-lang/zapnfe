"use client";

import { useActionState } from "react";
import Link from "next/link";
import { saveProductAction } from "@/app/erp/produtos/actions";
import type { ProductDetail } from "@/lib/erp/catalog/queries";
import type { SelectOption } from "@/lib/erp/shared/types";
import { SubmitButton } from "./submit-button";

export function ProductForm({ product, categories, units }: { product?: ProductDetail; categories: SelectOption[]; units: SelectOption[] }) {
  const [state, action] = useActionState(saveProductAction, null);
  return <form action={action} className="erp-form panel">
    {product ? <input type="hidden" name="id" value={product.id} /> : null}
    <div className="erp-form-grid">
      <label><span>SKU *</span><input name="sku" required maxLength={80} defaultValue={product?.sku ?? ""} /></label>
      <label className="wide"><span>Nome *</span><input name="name" required maxLength={180} defaultValue={product?.name ?? ""} /></label>
      <label><span>Código de barras</span><input name="barcode" maxLength={80} defaultValue={product?.barcode ?? ""} /></label>
      <label><span>Categoria</span><select name="categoryId" defaultValue={product?.categoryId ?? ""}><option value="">Sem categoria</option>{categories.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
      <label><span>Unidade</span><select name="unitId" defaultValue={product?.unitId ?? ""}><option value="">Selecione</option>{units.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
      <label><span>Custo</span><input name="costPrice" type="number" step="0.01" min="0" defaultValue={product?.costPrice ?? 0} /></label>
      <label><span>Preço de venda</span><input name="salePrice" type="number" step="0.01" min="0" defaultValue={product?.salePrice ?? 0} /></label>
      <label><span>Estoque mínimo</span><input name="minimumStock" type="number" step="0.001" min="0" defaultValue={product?.minimumStock ?? 0} /></label>
      <label><span>Estoque máximo</span><input name="maximumStock" type="number" step="0.001" min="0" defaultValue={product?.maximumStock ?? 0} /></label>
      <label className="wide"><span>Descrição</span><textarea name="description" maxLength={1000} rows={4} defaultValue={product?.description ?? ""} /></label>
    </div>
    <div className="erp-check-row"><label><input name="trackStock" type="checkbox" defaultChecked={product?.trackStock ?? true} /> Controlar estoque</label><label><input name="active" type="checkbox" defaultChecked={product?.active ?? true} /> Produto ativo</label></div>
    {state ? <p className={`erp-feedback ${state.ok ? "success" : "error"}`} role="status">{state.message}</p> : null}
    <div className="erp-form-actions"><Link className="secondary-button" href="/erp/produtos">Voltar</Link><SubmitButton>Salvar produto</SubmitButton></div>
  </form>;
}
