begin;

-- Hardening outbox_claim_jobs
create or replace function public.outbox_claim_jobs(p_worker_id text, p_limit int, p_lease_minutes int)
returns setof public.outbox_jobs
language plpgsql
security definer set search_path = ''
as $body
declare
  v_now timestamptz := now();
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') != 'service_role' and current_user not in ('postgres', 'supabase_admin') then
    raise exception 'UNAUTHORIZED_ACCESS_WORKER_ONLY';
  end if;

  return query
  with claimable as (
    select id from public.outbox_jobs
    where (
      (status = 'pending' and available_at <= v_now)
      or 
      (status = 'processing' and lock_expires_at < v_now)
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
$body;

revoke all on function public.outbox_claim_jobs(text, int, int) from public, anon, authenticated;
grant execute on function public.outbox_claim_jobs(text, int, int) to service_role;

-- Hardening outbox_complete_job
create or replace function public.outbox_complete_job(p_job_id uuid, p_result_payload jsonb)
returns void
language plpgsql
security definer set search_path = ''
as $body
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') != 'service_role' and current_user not in ('postgres', 'supabase_admin') then
    raise exception 'UNAUTHORIZED_ACCESS_WORKER_ONLY';
  end if;

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
$body;

revoke all on function public.outbox_complete_job(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.outbox_complete_job(uuid, jsonb) to service_role;

-- Hardening outbox_fail_job
create or replace function public.outbox_fail_job(p_job_id uuid, p_error text, p_retryable boolean, p_backoff_minutes int)
returns void
language plpgsql
security definer set search_path = ''
as $body
declare
  v_job record;
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') != 'service_role' and current_user not in ('postgres', 'supabase_admin') then
    raise exception 'UNAUTHORIZED_ACCESS_WORKER_ONLY';
  end if;

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
$body;

revoke all on function public.outbox_fail_job(uuid, text, boolean, int) from public, anon, authenticated;
grant execute on function public.outbox_fail_job(uuid, text, boolean, int) to service_role;

commit;
