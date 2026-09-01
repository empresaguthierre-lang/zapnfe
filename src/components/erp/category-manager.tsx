"use client";

import { useActionState } from "react";
import { saveCategoryAction } from "@/app/erp/produtos/actions";
import type { CategoryRow } from "@/lib/erp/catalog/queries";
import { SubmitButton } from "./submit-button";

export function CategoryManager({ categories }: { categories: CategoryRow[] }) {
  const [state, action] = useActionState(saveCategoryAction, null);
  return <div className="erp-split"><form action={action} className="erp-form panel"><div><p className="eyebrow">Catálogo</p><h3>Nova categoria</h3></div><label><span>Código *</span><input name="code" required maxLength={40} /></label><label><span>Nome *</span><input name="name" required maxLength={120} /></label><label><span>Categoria superior</span><select name="parentId" defaultValue=""><option value="">Nenhuma</option>{categories.filter((item) => item.active).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="erp-checkbox"><input type="checkbox" name="active" defaultChecked /> Ativa</label>{state ? <p className={`erp-feedback ${state.ok ? "success" : "error"}`}>{state.message}</p> : null}<SubmitButton>Salvar categoria</SubmitButton></form><div className="panel erp-table-wrap"><table className="erp-table"><thead><tr><th>Código</th><th>Categoria</th><th>Status</th></tr></thead><tbody>{categories.map((item) => <tr key={item.id}><td>{item.code}</td><td>{item.name}</td><td><span className={`erp-status ${item.active ? "ok" : "muted"}`}>{item.active ? "Ativa" : "Inativa"}</span></td></tr>)}</tbody></table></div></div>;
}
