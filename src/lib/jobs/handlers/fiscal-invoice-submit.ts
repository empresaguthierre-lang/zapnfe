/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { getFiscalProvider } from "../../erp/fiscal/providers/factory";
import { resolveSecret } from "../../erp/fiscal/secrets/resolver";

export async function fiscalInvoiceSubmitHandler(job: any, supabaseAdmin: any) {
  const invoiceId = job.entity_id;
  
  const { data: invoice, error: invoiceErr } = await supabaseAdmin
    .from("invoices")
    .select("*, invoice_items(*)")
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

  const referenceId = invoice.provider_reference || provider.generateReference(invoice.id);
  if (!invoice.provider_reference) {
    const { error: refErr } = await supabaseAdmin
      .from("invoices")
      .update({ provider_reference: referenceId })
      .eq("id", invoiceId)
      .eq("status", "submission_pending");
      
    if (refErr) return { success: false, retryable: true, backoffMinutes: 1, error: "Failed to persist provider_reference" };

    await supabaseAdmin.from("invoice_events").insert({
      organization_id: invoice.organization_id,
      invoice_id: invoiceId,
      event_type: "submission_started",
      description: `Iniciando submissao para provedor com ref ${referenceId}`
    });
  }

  console.log(`[FiscalHandler] Submitting invoice ${invoiceId} via ${providerCode}...`);
  const result = await provider.issueInvoice({
    invoiceId: invoice.id,
    providerReference: referenceId,
    payload: invoice,
    environment: environment as any,
    credentials
  });

  if (!result.success) {
    if (result.canonicalStatus === "error") {
      if (result.errorCode === "FOCUS_SUBMISSION_OUTCOME_UNKNOWN" && result.recoveryStrategy === "status_check_first") {
        await supabaseAdmin.from("outbox_jobs").insert({
          organization_id: invoice.organization_id,
          job_type: "fiscal.invoice.recover_submission",
          entity_type: "invoices",
          entity_id: invoiceId,
          payload: {}
        });
        return { success: false, retryable: false, error: "Submissão incerta (Timeout). Delegado para recovery." };
      }

      await supabaseAdmin.rpc("fiscal_record_submission_failure", {
        p_invoice_id: invoiceId,
        p_error_code: result.errorCode,
        p_error_message: `[${result.errorCode}] ${result.error}`,
        p_raw_response: result.rawResponse || { provider: providerCode, retryable: result.isRetryableError }
      });
      return { success: false, retryable: result.isRetryableError ?? false, backoffMinutes: 2, error: `[${result.errorCode}] ${result.error}` };
    }
  }

  if (result.canonicalStatus === "authorized") {
    const { error: authErr } = await supabaseAdmin.rpc("fiscal_record_authorization", {
      p_invoice_id: invoiceId,
      p_provider_reference: referenceId,
      p_access_key: result.accessKey,
      p_authorization_protocol: result.authorizationProtocol,
      p_authorized_at: result.authorizedAt,
      p_raw_response: result.rawResponse
    });
    if (authErr) return { success: false, retryable: true, backoffMinutes: 1, error: "Failed to record authorization: " + authErr.message };
  } else if (result.canonicalStatus === "rejected") {
    await supabaseAdmin.rpc("fiscal_record_rejection", {
      p_invoice_id: invoiceId,
      p_provider_reference: referenceId,
      p_rejection_code: result.errorCode || "REJECTED",
      p_rejection_message: result.error || "Rejeição SEFAZ",
      p_raw_response: result.rawResponse || {}
    });
  } else {
    const { error: updateErr } = await supabaseAdmin
      .from("invoices")
      .update({ status: result.canonicalStatus })
      .eq("id", invoiceId)
      .eq("status", "submission_pending");

    if (!updateErr) {
      await supabaseAdmin.from("invoice_events").insert({
        organization_id: invoice.organization_id,
        invoice_id: invoiceId,
        event_type: result.canonicalStatus,
        description: `Retorno do provedor: ${result.providerStatus}`,
        provider_response: result.rawResponse
      });
        
      if (result.canonicalStatus === "processing") {
        await supabaseAdmin.from("outbox_jobs").insert({
          organization_id: invoice.organization_id,
          job_type: "fiscal.invoice.status_check",
          entity_type: "invoices",
          entity_id: invoiceId,
          available_at: new Date(Date.now() + 5000).toISOString(),
          payload: {}
        });
      }
    } else {
      return { success: false, retryable: true, backoffMinutes: 1, error: "Concurrency update error: " + updateErr.message };
    }
  }

  return { success: true };
}
