"use client";

import { useActionState } from "react";
import { reverseMovementAction } from "@/app/estoque/actions";
import { SubmitButton } from "./submit-button";

export function ReversalForm({ movementId, disabled }: { movementId: string; disabled?: boolean }) {
  const [state, action] = useActionState(reverseMovementAction, null);
  if (disabled) return <p className="erp-feedback">Movimentações de reversão não podem ser revertidas novamente.</p>;
  return <form action={action} className="erp-form panel"><input name="movementId" type="hidden" value={movementId} /><label><span>Motivo da reversão *</span><textarea name="reason" required minLength={5} maxLength={500} rows={3} /></label>{state ? <p className={`erp-feedback ${state.ok ? "success" : "error"}`} role="status">{state.message}</p> : null}<SubmitButton className="danger-button" pendingLabel="Revertendo...">Reverter com lançamento compensatório</SubmitButton></form>;
}
