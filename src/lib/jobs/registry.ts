import { fiscalInvoiceSubmitHandler } from "./handlers/fiscal-invoice-submit";
import { fiscalInvoiceStatusCheckHandler } from "./handlers/fiscal-invoice-status-check";
import { fiscalInvoiceRecoverHandler } from "./handlers/fiscal-invoice-recover";

export type JobHandler = (job: any, supabaseAdmin: any) => Promise<{ success: boolean; retryable?: boolean; error?: string; backoffMinutes?: number }>;

const registry: Record<string, JobHandler> = {
  "fiscal.invoice.submit": fiscalInvoiceSubmitHandler,
  "fiscal.invoice.status_check": fiscalInvoiceStatusCheckHandler,
  "fiscal.invoice.recover_submission": fiscalInvoiceRecoverHandler,
};

export function getJobHandler(jobType: string): JobHandler | undefined {
  return registry[jobType];
}

