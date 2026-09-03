/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { getFiscalProvider } from "../../erp/fiscal/providers/factory";

export async function fiscalInvoiceSubmitHandler(job: any, supabaseAdmin: any) {
  const invoiceId = job.entity_id;
  
  // 1. Load Invoice Snapshot
  const { data: invoice, error: invoiceErr } = await supabaseAdmin
    .from("invoices")
    .select("*, invoice_items(*)")
    .eq("id", invoiceId)
    .single();

  if (invoiceErr || !invoice) {
    return { success: false, retryable: false, error: "Invoice not found in DB." };
  }

  // 2. Load Provider Account
  const { data: providerConfig, error: providerErr } = await supabaseAdmin
    .from("fiscal_provider_accounts")
    .select("*")
    .eq("organization_id", invoice.organization_id)
    .eq("active", true)
    .limit(1)
    .maybeSingle();

  const providerCode = providerConfig?.provider || "test_mock";
  const environment = providerConfig?.environment || "homologation";

  // 3. Factory execution
  let provider;
  try {
    provider = getFiscalProvider(providerCode, environment);
  } catch (err: any) {
    return { success: false, retryable: false, error: err.message };
  }

  // 4. Generate and Persist Provider Reference
  const referenceId = invoice.provider_reference || provider.generateReference(invoice.id);
  if (!invoice.provider_reference) {
    const { error: refErr } = await supabaseAdmin
      .from("invoices")
      .update({ provider_reference: referenceId, status: "submission_started" })
      .eq("id", invoiceId);
      
    if (refErr) return { success: false, retryable: true, backoffMinutes: 1, error: "Failed to persist provider_reference" };

    await supabaseAdmin.from("invoice_events").insert({
      organization_id: invoice.organization_id,
      invoice_id: invoiceId,
      event_type: "processing",
      description: `Iniciando submissão para provedor com ref ${referenceId}`
    });
  }

  // 5. Submit
  console.log(`[FiscalHandler] Submitting invoice ${invoiceId} via ${providerCode}...`);
  const result = await provider.issueInvoice({
    invoiceId: invoice.id,
    providerReference: referenceId,
    payload: invoice, // The provider's transformer will map this snapshot
    environment: environment as any,
    credentials: providerConfig?.credentials || { latencyMs: 0 }
  });

  // 6. Normalization & State Update
  if (!result.success) {
    if (result.canonicalStatus === "error") {
      if (result.errorCode === "FOCUS_SUBMISSION_OUTCOME_UNKNOWN" && result.recoveryStrategy === "status_check_first") {
        // Enqueue recover job instead of retrying submit
        await supabaseAdmin.from("outbox_jobs").insert({
          organization_id: invoice.organization_id,
          job_type: "fiscal.invoice.recover_submission",
          entity_type: "invoices",
          entity_id: invoiceId,
          payload: {}
        });
        
        return { 
          success: false, 
          retryable: false, 
          error: "Submissão incerta (Timeout). Delegado para recovery (status_check_first)."
        };
      }

      // Update the invoice to error and generate the event
      await supabaseAdmin.rpc("fiscal_record_submission_failure", {
        p_org_id: invoice.organization_id,
        p_invoice_id: invoiceId,
        p_error_code: result.errorCode,
        p_error_message: `[${result.errorCode}] ${result.error}`,
        p_raw_response: result.rawResponse || { provider: providerCode, retryable: result.isRetryableError }
      });

      return { 
        success: false, 
        retryable: result.isRetryableError ?? false, 
        backoffMinutes: 2, 
        error: `[${result.errorCode}] ${result.error}` 
      };
    }
  }
  
  // 7. Update Database using Service Role directly
  const { error: updateErr } = await supabaseAdmin
    .from("invoices")
    .update({ 
      status: result.canonicalStatus,
      provider_reference: result.providerReference 
    })
    .eq("id", invoiceId)
    // we could check status, but we now start from submission_started
    .eq("status", "submission_started"); 

  if (updateErr) {
    return { success: false, retryable: true, backoffMinutes: 1, error: "Concurrency mismatch updating invoice status" };
  }

  // 8. Record History Event
  await supabaseAdmin
    .from("invoice_events")
    .insert({
      organization_id: invoice.organization_id,
      invoice_id: invoiceId,
      event_type: result.canonicalStatus === "authorized" ? "authorized" : (result.canonicalStatus === "rejected" ? "rejected" : "processing"),
      description: `Retorno do provedor: ${result.providerStatus}`,
      provider_response: result.rawResponse,
      created_by: null // System actor
    });

  // 9. Enqueue Polling Job if still processing
  if (result.canonicalStatus === "processing") {
    const { error: outboxErr } = await supabaseAdmin
      .from("outbox_jobs")
      .insert({
        organization_id: invoice.organization_id,
        job_type: "fiscal.invoice.status_check",
        entity_type: "invoices",
        entity_id: invoiceId,
        available_at: new Date(Date.now() + 5000).toISOString(), // Poll in 5 seconds
        payload: {}
      });
      
    if (outboxErr) {
       console.error(`[FiscalHandler] Failed to enqueue status check for ${invoiceId}:`, outboxErr);
    }
  }

  return { success: true };
}
