import { getFiscalProvider } from "../../erp/fiscal/providers/factory";

export async function fiscalInvoiceSubmitHandler(job: any, supabaseAdmin: any) {
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

  // 2. Load Provider Account (Mocked logic for now, usually it comes from organization config)
  // In a real scenario, we'd query fiscal_provider_accounts. 
  // Let's use focus_nfe if an API token exists, otherwise fallback to test_mock.
  const providerCode = process.env.FOCUS_NFE_API_TOKEN ? "focus_nfe" : "test_mock"; 
  const environment = "homologation";

  // 3. Factory execution (Hard blocks test_mock in production)
  let provider;
  try {
    provider = getFiscalProvider(providerCode, environment);
  } catch (err: any) {
    return { success: false, retryable: false, error: err.message };
  }

  // 4. Submit
  console.log(`[FiscalHandler] Submitting invoice ${invoiceId} via ${providerCode}...`);
  const result = await provider.issueInvoice({
    invoiceId: invoice.id,
    payload: invoice, // The provider's transformer will map this snapshot
    environment: environment,
    credentials: { latencyMs: 0 }
  });

  // 5. Normalization & State Update
  if (!result.success) {
    if (result.canonicalStatus === 'error') {
      // Technical or unrecoverable system error (e.g., config error)
      // Note: A true SEFAZ Rejection (e.g. invalid NCM) might be a "success=false" but canonicalStatus='rejected'
      // But TestProvider returns error for production.
      return { success: false, retryable: true, backoffMinutes: 2, error: result.error };
    }
  }

  // If we got here, we had a successful communication with the provider.
  // The business result could be processing, authorized, or rejected.
  
  // 6. Update Database using Service Role directly, but respecting state logic.
  // We use raw updates here because we are the system worker.
  const { error: updateErr } = await supabaseAdmin
    .from('invoices')
    .update({ status: result.canonicalStatus })
    .eq('id', invoiceId)
    .eq('status', 'submission_pending'); // optimistic concurrency: only if still pending

  if (updateErr) {
    return { success: false, retryable: true, backoffMinutes: 1, error: "Concurrency mismatch updating invoice status" };
  }

  // 7. Record History Event
  await supabaseAdmin
    .from('invoice_events')
    .insert({
      organization_id: invoice.organization_id,
      invoice_id: invoiceId,
      event_type: result.canonicalStatus === 'authorized' ? 'authorized' : (result.canonicalStatus === 'rejected' ? 'rejected' : 'processing'),
      description: `Retorno do provedor: ${result.providerStatus}`,
      created_by: null // System actor
    });

  // 8. Enqueue Polling Job if still processing
  if (result.canonicalStatus === 'processing') {
    const { error: outboxErr } = await supabaseAdmin
      .from('outbox_jobs')
      .insert({
        organization_id: invoice.organization_id,
        job_type: 'fiscal.invoice.status_check',
        entity_type: 'invoices',
        entity_id: invoiceId,
        available_at: new Date(Date.now() + 5000).toISOString(), // Poll in 5 seconds
        payload: {}
      });
      
    if (outboxErr) {
       console.error(`[FiscalHandler] Failed to enqueue status check for ${invoiceId}:`, outboxErr);
       // We still return success: true because the SUBMIT job succeeded. 
       // In a real system, we'd have a sweep job for orphaned processing invoices.
    }
  }

  // Business logic: if canonicalStatus is 'rejected', the job completed its duty. The INVOICE is rejected, but the JOB succeeded in processing it.
  return { success: true };
}