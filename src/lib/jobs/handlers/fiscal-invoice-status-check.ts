/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { getFiscalProvider } from "../../erp/fiscal/providers/factory";

export async function fiscalInvoiceStatusCheckHandler(job: any, supabaseAdmin: any) {
  const invoiceId = job.entity_id;

  // 1. Load Invoice
  const { data: invoice, error: invoiceErr } = await supabaseAdmin
    .from("invoices")
    .select("*")
    .eq("id", invoiceId)
    .single();

  if (invoiceErr || !invoice) {
    return { success: false, retryable: false, error: "Invoice not found in DB." };
  }

  if (invoice.status !== "processing") {
    return { success: true, error: "Invoice is not in processing state. Ignoring status check." };
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

  let provider;
  try {
    provider = getFiscalProvider(providerCode, environment);
  } catch (err: any) {
    return { success: false, retryable: false, error: err.message };
  }

  // 3. Poll Status
  console.log(`[FiscalHandler] Polling status for invoice ${invoiceId} via ${providerCode}...`);
  const result = await provider.getInvoiceStatus({
    invoiceId: invoice.id,
    providerReference: invoice.provider_reference || "test_ref",
    environment: environment as any,
    credentials: providerConfig?.credentials || { latencyMs: 0 }
  });

  if (!result.success && result.canonicalStatus !== "rejected") {
    return { 
      success: false, 
      retryable: result.isRetryableError ?? false, 
      backoffMinutes: 2, 
      error: `[${result.errorCode}] ${result.error}` 
    };
  }

  // If status is still processing, retry later
  if (result.canonicalStatus === "processing") {
    return { success: false, retryable: true, backoffMinutes: 1, error: "Still processing" };
  }

  // Final Status Updates
  if (result.canonicalStatus === "authorized") {
    const { error: authErr } = await supabaseAdmin.rpc("fiscal_record_authorization", {
      p_invoice_id: invoiceId,
      p_provider_reference: invoice.provider_reference,
      p_access_key: result.accessKey,
      p_authorization_protocol: result.authorizationProtocol,
      p_authorized_at: result.authorizedAt,
      p_raw_response: result.rawResponse
    });
    if (authErr) return { success: false, retryable: true, backoffMinutes: 1, error: "Failed to record authorization: " + authErr.message };
  } else if (result.canonicalStatus === "error" || result.canonicalStatus === "rejected") {
    await supabaseAdmin.rpc("fiscal_record_submission_failure", {
      p_invoice_id: invoiceId,
      p_error_code: result.errorCode,
      p_error_message: `[${result.errorCode}] ${result.error}`,
      p_raw_response: result.rawResponse || {}
    });
  }

  return { success: true };
}


