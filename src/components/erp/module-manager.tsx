"use client";

import { useActionState } from "react";
import { setModuleAction } from "@/app/erp/configuracoes/actions";
import type { ErpModule } from "@/lib/erp/organization/queries";
import { SubmitButton } from "./submit-button";

function ModuleControl({ module }: { module: ErpModule }) {
  const [state, action] = useActionState(setModuleAction, null);
  return <article className="panel erp-module-card"><div><h3>{module.name}</h3><p>{module.description ?? `Módulo ${module.code}.`}</p></div><form action={action}><input type="hidden" name="moduleId" value={module.id} /><input type="hidden" name="enabled" value={module.enabled ? "false" : "true"} /><SubmitButton className={module.enabled ? "secondary-button" : "primary-button"}>{module.isCore ? "Essencial" : module.enabled ? "Desativar" : "Ativar"}</SubmitButton></form>{state ? <p className={`erp-feedback ${state.ok ? "success" : "error"}`}>{state.message}</p> : null}</article>;
}

export function ModuleManager({ modules }: { modules: ErpModule[] }) { return <div className="erp-module-grid">{modules.map((module) => <ModuleControl key={module.id} module={module} />)}</div>; }
