/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { createClient } from "@supabase/supabase-js";
import { getJobHandler } from "./registry";

export async function processOutboxQueue(workerId: string) {
  // Worker needs service role to claim jobs across all tenants
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    const { data: jobs, error } = await supabaseAdmin.rpc("outbox_claim_jobs", {
      p_worker_id: workerId,
      p_limit: 5,
      p_lease_minutes: 5
    });

    if (error) {
      console.error("[Worker] Error claiming jobs:", error);
      return;
    }

    if (!jobs || jobs.length === 0) {
      return; // Queue is empty
    }

    console.log(`[Worker] Claimed ${jobs.length} jobs.`);

    for (const job of jobs) {
      const handler = getJobHandler(job.job_type);
      
      if (!handler) {
        console.error(`[Worker] No handler found for job type: ${job.job_type}`);
        await supabaseAdmin.rpc("outbox_fail_job", {
          p_job_id: job.id,
          p_error: `Unregistered job type: ${job.job_type}`,
          p_retryable: false,
          p_backoff_minutes: 0
        });
        continue;
      }

      try {
        console.log(`[Worker] Executing job ${job.id} (${job.job_type})`);
        const result = await handler(job, supabaseAdmin);
        
        if (result.success) {
          await supabaseAdmin.rpc("outbox_complete_job", {
            p_job_id: job.id,
            p_result_payload: {} // Handlers already record business events, so payload is just meta
          });
          console.log(`[Worker] Job ${job.id} completed successfully.`);
        } else {
          await supabaseAdmin.rpc("outbox_fail_job", {
            p_job_id: job.id,
            p_error: result.error || "Unknown error",
            p_retryable: result.retryable || false,
            p_backoff_minutes: result.backoffMinutes || 5
          });
          console.log(`[Worker] Job ${job.id} failed. Retryable: ${result.retryable}`);
        }
      } catch (err: any) {
        console.error(`[Worker] Unhandled crash in job ${job.id}:`, err);
        await supabaseAdmin.rpc("outbox_fail_job", {
          p_job_id: job.id,
          p_error: err.message || "Unhandled exception",
          p_retryable: true,
          p_backoff_minutes: 2
        });
      }
    }
  } catch (err) {
    console.error("[Worker] Loop crash:", err);
  }
}
