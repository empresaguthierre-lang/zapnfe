"use client";

import { useActionState } from "react";
import { saveWarehouseAction } from "@/app/erp/estoque/actions";
import type { WarehouseRow } from "@/lib/erp/inventory/queries";
import type { Branch } from "@/lib/erp/organization/queries";
import { SubmitButton } from "./submit-button";

export function WarehouseManager({ warehouses, branches }: { warehouses: WarehouseRow[]; branches: Branch[] }) {
  const [state, action] = useActionState(saveWarehouseAction, null);
  return <div className="erp-split"><form action={action} className="erp-form panel"><div><p className="eyebrow">Estrutura</p><h3>Novo depósito</h3></div><label><span>Código *</span><input name="code" required maxLength={30} /></label><label><span>Nome *</span><input name="name" required maxLength={120} /></label><label><span>Filial</span><select name="branchId" defaultValue=""><option value="">Sem filial</option>{branches.filter((item) => item.active).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="erp-checkbox"><input type="checkbox" name="active" defaultChecked /> Ativo</label>{state ? <p className={`erp-feedback ${state.ok ? "success" : "error"}`}>{state.message}</p> : null}<SubmitButton>Salvar depósito</SubmitButton></form><div className="panel erp-table-wrap"><table className="erp-table"><thead><tr><th>Código</th><th>Depósito</th><th>Filial</th><th>Status</th></tr></thead><tbody>{warehouses.map((item) => <tr key={item.id}><td>{item.code}</td><td>{item.name}</td><td>{item.branchName ?? "—"}</td><td><span className={`erp-status ${item.active ? "ok" : "muted"}`}>{item.active ? "Ativo" : "Inativo"}</span></td></tr>)}</tbody></table></div></div>;
}
