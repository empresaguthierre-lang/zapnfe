"use client";

import { useActionState } from "react";
import { saveBranchAction } from "@/app/configuracoes/actions";
import type { Branch } from "@/lib/erp/organization/queries";
import { SubmitButton } from "./submit-button";

export function BranchManager({ branches }: { branches: Branch[] }) {
  const [state, action] = useActionState(saveBranchAction, null);
  return <div className="erp-split"><form action={action} className="erp-form panel"><div><p className="eyebrow">Organização</p><h3>Nova filial</h3></div><label><span>Código *</span><input name="code" required maxLength={30} /></label><label><span>Razão social / nome *</span><input name="name" required maxLength={120} /></label><label><span>Nome fantasia</span><input name="tradeName" maxLength={120} /></label><label><span>CNPJ/CPF</span><input name="document" maxLength={20} /></label><label><span>E-mail</span><input name="email" type="email" maxLength={160} /></label><label><span>Telefone</span><input name="phone" maxLength={20} /></label><div className="erp-check-row"><label><input type="checkbox" name="isHeadquarters" /> Matriz</label><label><input type="checkbox" name="active" defaultChecked /> Ativa</label></div>{state ? <p className={`erp-feedback ${state.ok ? "success" : "error"}`}>{state.message}</p> : null}<SubmitButton>Salvar filial</SubmitButton></form><div className="panel erp-table-wrap"><table className="erp-table"><thead><tr><th>Código</th><th>Filial</th><th>Documento</th><th>Status</th></tr></thead><tbody>{branches.map((item) => <tr key={item.id}><td>{item.code}</td><td>{item.name}{item.isHeadquarters ? <small className="erp-inline-note">Matriz</small> : null}</td><td>{item.document ?? "—"}</td><td><span className={`erp-status ${item.active ? "ok" : "muted"}`}>{item.active ? "Ativa" : "Inativa"}</span></td></tr>)}</tbody></table></div></div>;
}
