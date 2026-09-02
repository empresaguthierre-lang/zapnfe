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
  const providerCode = process.env.FOCUS_NFE_API_TOKEN ? "focus_nfe" : "test_mock"; 
  const environment = "homologation";

  // 3. Factory execution
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
    if (result.canonicalStatus === "error") {
      return { success: false, retryable: true, backoffMinutes: 2, error: result.error };
    }
  }
  
  // 6. Update Database using Service Role directly
  const { error: updateErr } = await supabaseAdmin
    .from("invoices")
    .update({ 
      status: result.canonicalStatus,
      provider_reference: result.providerReference 
    })
    .eq("id", invoiceId)
    .eq("status", "submission_pending"); // optimistic concurrency

  if (updateErr) {
    return { success: false, retryable: true, backoffMinutes: 1, error: "Concurrency mismatch updating invoice status" };
  }

  // 7. Record History Event
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

  // 8. Enqueue Polling Job if still processing
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

