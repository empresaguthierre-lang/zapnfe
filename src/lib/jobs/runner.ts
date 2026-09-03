/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
import * as dotenv from 'dotenv';
// Load env vars from .env.local for local testing
dotenv.config({ path: '.env.local' });

import { processOutboxQueue } from './worker';
import { fiscalInvoiceSubmitHandler } from "./handlers/fiscal-invoice-submit";
import { fiscalInvoiceStatusCheckHandler } from "./handlers/fiscal-invoice-status-check";
import { fiscalInvoiceRecoverHandler } from "./handlers/fiscal-invoice-recover";

// Job Registry mapping job_type to handler functions
const JOB_HANDLERS: Record<string, (job: any, supabaseAdmin: any) => Promise<{ success: boolean; retryable?: boolean; backoffMinutes?: number; error?: string }>> = {
  "fiscal.invoice.submit": fiscalInvoiceSubmitHandler,
  "fiscal.invoice.status_check": fiscalInvoiceStatusCheckHandler,
  "fiscal.invoice.recover_submission": fiscalInvoiceRecoverHandler,
};

const WORKER_ID = `worker-${Math.random().toString(36).substring(2, 9)}`;
const POLLING_INTERVAL = 3000;

console.log(`[Worker] Started with ID: ${WORKER_ID}`);

async function loop() {
  await processOutboxQueue(WORKER_ID);
  setTimeout(loop, POLLING_INTERVAL);
}

loop();
