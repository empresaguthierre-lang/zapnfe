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
  const { error: updateErr } = await supabaseAdmin
    .from("invoices")
    .update({ 
      status: result.canonicalStatus,
      provider_access_key: result.accessKey,
      provider_authorization_protocol: result.authorizationProtocol
    })
    .eq("id", invoiceId)
    .eq("status", "processing"); // optimistic concurrency

  if (updateErr) {
    return { success: false, retryable: true, backoffMinutes: 1, error: "Concurrency mismatch updating invoice status" };
  }

  // Record History Event
  await supabaseAdmin
    .from("invoice_events")
    .insert({
      organization_id: invoice.organization_id,
      invoice_id: invoiceId,
      event_type: result.canonicalStatus === "authorized" ? "authorized" : "rejected",
      description: `Retorno final: ${result.providerStatus} ${result.authorizationProtocol ? `Prot: ${result.authorizationProtocol}` : ""}`,
      provider_response: result.rawResponse,
      created_by: null
    });

  return { success: true };
}


