import { getFiscalProvider } from "../../erp/fiscal/providers/factory";

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

  const providerCode = providerConfig?.provider || "test_mock";
  const environment = providerConfig?.environment || "homologation";

  let provider;
  try {
    provider = getFiscalProvider(providerCode, environment);
  } catch (err: any) {
    return { success: false, retryable: false, error: err.message };
  }

  console.log(`[FiscalHandler] Recovering unknown submission for ${invoiceId}...`);
  const result = await provider.getInvoiceStatus({
    invoiceId: invoice.id,
    providerReference: invoice.provider_reference, // Might be null if it was never saved, but adapter will regenerate it
    environment: environment as any,
    credentials: providerConfig?.credentials || { latencyMs: 0 }
  });

  if (!result.success) {
    if (result.errorCode === "REFERENCE_NOT_FOUND") {
      // 2. Focus conclusively answers: document does not exist.
      // We must reschedule fiscal.invoice.submit using the SAME ref
      console.log(`[FiscalHandler] Recovery for ${invoiceId}: Not Found. Rescheduling submit.`);
      await supabaseAdmin.from("outbox_jobs").insert({
        organization_id: invoice.organization_id,
        job_type: "fiscal.invoice.submit",
        entity_type: "invoices",
        entity_id: invoiceId,
        payload: {} // It will regenerate the SAME deterministic ref BRIDGE[ID]
      });
      return { success: true }; // Recover job finished successfully
    }
    
    // 3. Technical failure on the recovery check itself -> retry this recovery job
    return { 
      success: false, 
      retryable: result.isRetryableError ?? true, 
      backoffMinutes: 2, 
      error: `[${result.errorCode}] ${result.error}` 
    };
  }

  // 1. Focus knows the ref (processing, authorized, rejected) -> We follow normal flow!
  // First, ensure the provider_reference is saved on the invoice if it wasn"t
  const expectedRef = invoice.provider_reference || ("BRIDGE" + invoiceId.replace(/-/g, "").toUpperCase());
  
  const { error: updateErr } = await supabaseAdmin
    .from("invoices")
    .update({ 
      status: result.canonicalStatus,
      provider_reference: expectedRef,
      provider_access_key: result.accessKey,
      provider_authorization_protocol: result.authorizationProtocol
    })
    .eq("id", invoiceId);

  if (!updateErr) {
    await supabaseAdmin
      .from("invoice_events")
      .insert({
        organization_id: invoice.organization_id,
        invoice_id: invoiceId,
        event_type: result.canonicalStatus === "authorized" ? "authorized" : (result.canonicalStatus === "rejected" ? "rejected" : "processing"),
        description: `Recuperação bem-sucedida: ${result.providerStatus}`,
        provider_response: result.rawResponse,
        created_by: null
      });
      
    if (result.canonicalStatus === "processing") {
      // Still processing, enqueue standard status check
      await supabaseAdmin.from("outbox_jobs").insert({
        organization_id: invoice.organization_id,
        job_type: "fiscal.invoice.status_check",
        entity_type: "invoices",
        entity_id: invoiceId,
        available_at: new Date(Date.now() + 5000).toISOString(),
        payload: {}
      });
    }
  }

  return { success: true };
}

