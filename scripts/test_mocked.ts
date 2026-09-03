import { fiscalInvoiceSubmitHandler } from "../src/lib/jobs/handlers/fiscal-invoice-submit";

async function run() {
  const invoiceId = "fake-invoice-id";
  const orgId = "fake-org-id";
  
  let providerReferenceUpdated = false;
  let statusUpdated = false;
  let events: any[] = [];
  let rpcCalls: any[] = [];
  let outboxJobs: any[] = [];

  const supabaseMock = {
    from: (table: string) => {
      return {
        select: (cols: string) => {
          const chain: any = {
            eq: (k: string, v: any) => chain,
            limit: (n: number) => chain,
            single: async () => {
              if (table === "invoices") {
                return { 
                  data: { 
                    id: invoiceId, 
                    organization_id: orgId, 
                    status: "submission_pending",
                    issuer_tax_regime_snapshot: "simples_nacional",
                    invoice_items: []
                  }, 
                  error: null 
                };
              }
              return { data: null, error: { message: "Not found" } };
            },
            maybeSingle: async () => {
              if (table === "fiscal_provider_accounts") {
                return { data: { provider: "focus_nfe", environment: "homologation", credentials_reference: "missing_secret_reference" }, error: null };
              }
              return { data: null, error: null };
            }
          };
          return chain;
        },
        update: (payload: any) => {
          const chain: any = {
            eq: (k: string, v: any) => chain,
            then: (res: any, rej: any) => {
              if (table === "invoices") {
                if (payload.provider_reference) providerReferenceUpdated = true;
                if (payload.status) statusUpdated = payload.status;
              }
              res({ error: null });
            }
          };
          return chain;
        },
        insert: async (payload: any) => {
          if (table === "invoice_events") events.push(payload);
          if (table === "outbox_jobs") outboxJobs.push(payload);
          return { error: null };
        }
      };
    },
    rpc: async (fn: string, payload: any) => {
      rpcCalls.push({ fn, payload });
      return { error: null };
    }
  };

  const job = { entity_id: invoiceId };
  
  process.env.FOCUS_NFE_API_TOKEN = "";

  console.log("Running handler...");
  const result = await fiscalInvoiceSubmitHandler(job, supabaseMock as any);
  
  console.log("Handler result:", result);
  console.log("Events inserted:", events);
  console.log("RPC calls:", rpcCalls);
}
run().catch(console.error);
