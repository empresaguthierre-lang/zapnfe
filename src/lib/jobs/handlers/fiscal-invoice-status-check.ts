import { getFiscalProvider } from "../../erp/fiscal/providers/factory";

export async function fiscalInvoiceStatusCheckHandler(job: any, supabaseAdmin: any) {
  const invoiceId = job.entity_id;
  
  // 1. Load Invoice Snapshot
  const { data: invoice, error: invoiceErr } = await supabaseAdmin
    .from('invoices')
    .select('*')
    .eq('id', invoiceId)
    .single();

  if (invoiceErr || !invoice) {
    return { success: false, retryable: false, error: "Invoice not found in DB." };
  }

  if (invoice.status !== 'processing') {
    return { success: true }; // Already finished
  }

  // 2. Load Provider Account
  const providerCode = process.env.FOCUS_NFE_API_TOKEN ? "focus_nfe" : "test_mock"; 
  const environment = "homologation";

  let provider;
  try {
    provider = getFiscalProvider(providerCode, environment);
  } catch (err: any) {
    return { success: false, retryable: false, error: err.message };
  }

  console.log(`[FiscalHandler] Checking status for invoice ${invoiceId} via ${providerCode}...`);
  const result = await provider.getInvoiceStatus({
    invoiceId: invoice.id,
    providerReference: invoice.provider_reference || "test_ref",
    environment: environment,
    credentials: { latencyMs: 0 }
  });

  if (!result.success && result.canonicalStatus !== 'rejected') {
     return { success: false, retryable: true, backoffMinutes: 1, error: result.error || "Provider error" };
  }

  // If status is still processing, retry later
  if (result.canonicalStatus === 'processing') {
     return { success: false, retryable: true, backoffMinutes: 1, error: "Still processing" };
  }

  // Final Status Updates
  const { error: updateErr } = await supabaseAdmin
    .from('invoices')
    .update({ 
       status: result.canonicalStatus,
       provider_access_key: result.accessKey || null,
       provider_authorization_protocol: result.authorizationProtocol || null
    })
    .eq('id', invoiceId)
    .eq('status', 'processing'); 

  if (updateErr) {
    return { success: false, retryable: true, backoffMinutes: 1, error: "Concurrency mismatch updating invoice status" };
  }

  // Record History Event
  await supabaseAdmin
    .from('invoice_events')
    .insert({
      organization_id: invoice.organization_id,
      invoice_id: invoiceId,
      event_type: result.canonicalStatus === 'authorized' ? 'authorized' : 'rejected',
      description: `Retorno final: ${result.providerStatus} ${result.authorizationProtocol ? `Prot: ${result.authorizationProtocol}` : ''}`,
      created_by: null
    });

  return { success: true };
}

