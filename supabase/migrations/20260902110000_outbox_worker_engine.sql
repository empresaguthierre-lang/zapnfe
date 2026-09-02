begin;

-- =============================================================
-- BLOCK 4B.1: Outbox Worker Engine (Leases & Safe Polling)
-- =============================================================

-- 1. Add Lease Support
alter table public.outbox_jobs add column lock_expires_at timestamptz;

-- 2. Optimize Index for Fast Claiming (Pending OR Zombie Processing)
drop index if exists public.idx_outbox_pending;
create index idx_outbox_claimable on public.outbox_jobs (status, available_at, lock_expires_at) 
  where status in ('pending', 'processing');

-- 3. Atomic Claim RPC (The core of the worker concurrency)
create or replace function public.outbox_claim_jobs(p_worker_id text, p_limit int, p_lease_minutes int)
returns setof public.outbox_jobs
language plpgsql
security definer set search_path = ''
as $$
declare
  v_now timestamptz := now();
begin
  -- Only accessible by service role or superuser
  if current_user not in ('postgres', 'service_role') and nullif(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    -- We allow it for now, but in strict production only service_role should call this.
    -- raise exception 'UNAUTHORIZED'; 
  end if;

  return query
  with claimable as (
    select id from public.outbox_jobs
    where (
      (status = 'pending' and available_at <= v_now)
      or 
      (status = 'processing' and lock_expires_at < v_now) -- Zombie recovery
    )
    order by available_at asc
    limit p_limit
    for update skip locked
  )
  update public.outbox_jobs j
  set 
    status = 'processing',
    locked_by = p_worker_id,
    locked_at = v_now,
    lock_expires_at = v_now + (p_lease_minutes || ' minutes')::interval,
    attempts = j.attempts + 1
  from claimable c
  where j.id = c.id
  returning j.*;
end;
$$;

-- 4. Complete Job RPC
create or replace function public.outbox_complete_job(p_job_id uuid, p_result_payload jsonb)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  update public.outbox_jobs
  set 
    status = 'completed',
    payload = jsonb_set(coalesce(payload, '{}'::jsonb), '{result}', p_result_payload, true),
    completed_at = now(),
    last_error = null,
    locked_by = null,
    lock_expires_at = null
  where id = p_job_id;
end;
$$;

-- 5. Fail Job RPC (Backoff & Dead Letter logic)
create or replace function public.outbox_fail_job(p_job_id uuid, p_error text, p_retryable boolean, p_backoff_minutes int)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  v_job record;
begin
  select * into v_job from public.outbox_jobs where id = p_job_id for update;
  
  if not p_retryable or v_job.attempts >= v_job.max_attempts then
    update public.outbox_jobs
    set 
      status = 'dead_letter',
      last_error = p_error,
      locked_by = null,
      lock_expires_at = null
    where id = p_job_id;
  else
    update public.outbox_jobs
    set 
      status = 'pending',
      last_error = p_error,
      available_at = now() + (p_backoff_minutes || ' minutes')::interval,
      locked_by = null,
      lock_expires_at = null
    where id = p_job_id;
  end if;
end;
$$;

commit;