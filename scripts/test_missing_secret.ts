import { createClient } from "@supabase/supabase-js";
import { fiscalInvoiceSubmitHandler } from "../src/lib/jobs/handlers/fiscal-invoice-submit";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

async function run() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  
  console.log("Setting up test data...");
  const orgId = "2ae1ba69-70ae-4df5-a859-2d521a6089b6";
  
  await supabase.from("fiscal_provider_accounts").delete().eq("organization_id", orgId);
  await supabase.from("fiscal_provider_accounts").insert({
    organization_id: orgId,
    provider: "focus_nfe",
    environment: "homologation",
    active: true,
    credentials: { credentials_reference: "missing_secret_reference" }
  });

  const { data: customer } = await supabase.from("customers").select("id").eq("organization_id", orgId).limit(1).single();

  const { data: invoice } = await supabase.from("invoices").insert({
    organization_id: orgId,
    customer_id: customer!.id,
    status: "submission_pending",
    total_amount: 100,
    issuer_tax_regime_snapshot: "simples_nacional",
    invoice_type: "nfe"
  }).select().single();

  console.log("Created invoice:", invoice!.id);
  
  const { data: job } = await supabase.from("outbox_jobs").insert({
    organization_id: orgId,
    job_type: "fiscal.invoice.submit",
    entity_type: "invoices",
    entity_id: invoice!.id,
    payload: {}
  }).select().single();

  console.log("Running handler...");
  
  process.env.FOCUS_NFE_API_TOKEN = ""; // ensure it's empty

  const result = await fiscalInvoiceSubmitHandler(job, supabase);
  console.log("Handler result:", result);
  
  const { data: updated } = await supabase.from("invoices").select("status").eq("id", invoice!.id).single();
  console.log("Final Invoice Status:", updated?.status);
  
  const { data: events } = await supabase.from("invoice_events").select("event_type, description, provider_response").eq("invoice_id", invoice!.id);
  console.log("Events:", events);
}
run().catch(console.error);
