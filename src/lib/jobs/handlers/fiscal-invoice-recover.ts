/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { getFiscalProvider } from "../../erp/fiscal/providers/factory";
import { resolveSecret } from "../../erp/fiscal/secrets/resolver";

export async function fiscalInvoiceRecoverHandler(job: any, supabaseAdmin: any) {
  const invoiceId = job.entity_id;

  const { data: invoice, error: invoiceErr } = await supabaseAdmin
    .from("invoices")
    .select("*")
    .eq("id", invoiceId)
    .single();

  if (invoiceErr || !invoice) {
    return { success: false, retryable: false, error: "Invoice not found in DB." };
  }

  const { data: providerConfig, error: providerErr } = await supabaseAdmin
    .from("fiscal_provider_accounts")
    .select("*")
    .eq("organization_id", invoice.organization_id)
    .eq("active", true)
    .limit(1)
    .maybeSingle();

  const providerCode = providerConfig?.provider;
  if (!providerCode) return { success: false, retryable: false, error: "No fiscal provider configured for this organization." };
  
  const environment = providerConfig?.environment || "homologation";

  let provider;
  try {
    provider = getFiscalProvider(providerCode, environment);
  } catch (err: any) {
    return { success: false, retryable: false, error: err.message };
  }

  const credentials = await resolveSecret(providerConfig?.credentials_reference || providerConfig?.credentials?.credentials_reference);

  console.log(`[FiscalHandler] Recovering unknown submission for ${invoiceId}...`);
  const result = await provider.getInvoiceStatus({
    invoiceId: invoice.id,
    providerReference: invoice.provider_reference, // Might be null if it was never saved, but adapter will regenerate it
    environment: environment as any,
    credentials
  });

  if (!result.success) {
    if (result.errorCode === "REFERENCE_NOT_FOUND") {
      console.log(`[FiscalHandler] Recovery for ${invoiceId}: Not Found. Rescheduling submit.`);
      await supabaseAdmin.from("outbox_jobs").insert({
        organization_id: invoice.organization_id,
        job_type: "fiscal.invoice.submit",
        entity_type: "invoices",
        entity_id: invoiceId,
        payload: {}
      });
      return { success: true }; 
    }
    return { 
      success: false, retryable: result.isRetryableError ?? true, backoffMinutes: 2, 
      error: `[${result.errorCode}] ${result.error}` 
    };
  }

  const expectedRef = invoice.provider_reference || ("BRIDGE" + invoiceId.replace(/-/g, "").toUpperCase());
  
  if (result.canonicalStatus === "authorized") {
    const { error: authErr } = await supabaseAdmin.rpc("fiscal_record_authorization", {
      p_invoice_id: invoiceId, p_provider_reference: expectedRef, p_access_key: result.accessKey,
      p_authorization_protocol: result.authorizationProtocol, p_authorized_at: result.authorizedAt,
      p_raw_response: result.rawResponse
    });
    if (authErr) return { success: false, retryable: true, backoffMinutes: 1, error: "Failed to record authorization: " + authErr.message };
  } else if (result.canonicalStatus === "rejected") {
    await supabaseAdmin.rpc("fiscal_record_rejection", {
      p_invoice_id: invoiceId, p_provider_reference: expectedRef,
      p_rejection_code: result.errorCode || "REJECTED", p_rejection_message: result.error || "Rejeição SEFAZ",
      p_raw_response: result.rawResponse || {}
    });
  } else if (result.canonicalStatus === "error") {
    await supabaseAdmin.rpc("fiscal_record_submission_failure", {
      p_invoice_id: invoiceId, p_error_code: result.errorCode, p_error_message: result.error || "Erro no processamento",
      p_raw_response: result.rawResponse || {}
    });
  } else {
    // Still processing
    const { error: updateErr } = await supabaseAdmin
      .from("invoices")
      .update({ status: result.canonicalStatus, provider_reference: expectedRef })
      .eq("id", invoiceId);

    if (!updateErr) {
      await supabaseAdmin.from("invoice_events").insert({
        organization_id: invoice.organization_id, invoice_id: invoiceId, event_type: "processing",
        description: `Recuperação bem-sucedida: ${result.providerStatus}`, provider_response: result.rawResponse
      });
      await supabaseAdmin.from("outbox_jobs").insert({
        organization_id: invoice.organization_id, job_type: "fiscal.invoice.status_check",
        entity_type: "invoices", entity_id: invoiceId, available_at: new Date(Date.now() + 5000).toISOString(), payload: {}
      });
    }
  }

  return { success: true };
}
