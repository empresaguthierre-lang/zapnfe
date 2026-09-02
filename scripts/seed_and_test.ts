import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const ORG_ID = "2ae1ba69-70ae-4df5-a859-2d521a6089b6";

async function run() {
  console.log("Seeding provider account...");
  await sb.from("fiscal_provider_accounts").delete().eq("organization_id", ORG_ID);
  await sb.from("fiscal_provider_accounts").insert({
    organization_id: ORG_ID,
    provider: "focus_nfe",
    environment: "homologation",
    credentials: { apiToken: "tk_mock_fail_auth_token_for_focus" },
    active: true
  });

  console.log("Seeding test invoice...");
  const { data: inv, error } = await sb.from("invoices").insert({
    organization_id: ORG_ID,
    status: "draft",
    draft_revision: 1,
    operation_nature: "Venda",
    issued_at: new Date().toISOString(),
    total_amount: 100,
    issuer_legal_name_snapshot: "Zapala Atacado Ltda",
    issuer_cnpj_snapshot: "12345678000199",
    issuer_tax_regime_snapshot: "simples_nacional",
    recipient_name_snapshot: "Cliente Homologacao",
    recipient_document_snapshot: "12345678909",
    recipient_address_snapshot: { state: "SP" },
    issuer_address_snapshot: { state: "SP" }
  }).select().single();

  if (error) {
     console.error(error);
     return;
  }

  const invId = inv.id;

  console.log("Seeding invoice items...");
  await sb.from("invoice_items").insert({
    invoice_id: invId,
    item_sequence: 1,
    product_id: "00000000-0000-0000-0000-000000000000",
    product_name_snapshot: "Produto Teste",
    quantity: 1,
    unit_price_snapshot: 100,
    total_price_snapshot: 100,
    cfop_snapshot: "5102",
    ncm_snapshot: "00000000"
  });

  console.log(`Queueing invoice ${invId}...`);
  await sb.rpc("fiscal_queue_invoice_submission", { p_invoice_id: invId });

  console.log("Running worker for a few seconds to process submission...");
  // Use spawn to run worker
  const { spawn } = require("child_process");
  const worker = spawn("npx", ["tsx", "src/lib/jobs/runner.ts"], { stdio: "inherit" });
  
  setTimeout(async () => {
    worker.kill();
    console.log("\n--- RESULTADOS ---");
    
    const { data: updatedInv } = await sb.from("invoices").select("*").eq("id", invId).single();
    const { data: events } = await sb.from("invoice_events").select("*").eq("invoice_id", invId).order("event_date");
    const { data: outbox } = await sb.from("outbox_jobs").select("*").eq("entity_id", invId);

    console.log("invoice_id:", updatedInv.id);
    console.log("status final:", updatedInv.status);
    console.log("focus_ref:", updatedInv.provider_reference);
    
    console.log("\naccess_key:", updatedInv.provider_access_key ? "PRESENTE" : "AUSENTE");
    console.log("protocol:", updatedInv.provider_authorization_protocol ? "PRESENTE" : "AUSENTE");
    
    console.log("\noutbox final:");
    outbox.forEach(ob => console.log(`- ${ob.job_type}: ${ob.status} (attempts: ${ob.attempts})`));
    
    console.log("\ninvoice_events:");
    events.forEach(ev => {
      console.log(`- [${ev.event_type}] ${ev.description}`);
      if (ev.provider_response) console.log("  Response:", JSON.stringify(ev.provider_response));
    });

  }, 10000);
}

run();

