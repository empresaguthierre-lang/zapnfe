begin;

drop policy if exists cust_rest_org on public.customer_restrictions;
create policy cust_rest_select on public.customer_restrictions
  for select to authenticated
  using (public.is_organization_member(organization_id));

revoke insert, update, delete on public.customer_restrictions from authenticated, anon;

create or replace function public.customer_apply_restriction(
  p_org_id uuid,
  p_customer_id uuid,
  p_module public.restriction_module,
  p_type text,
  p_scope public.restriction_scope,
  p_severity public.restriction_severity,
  p_reason text,
  p_reason_code text default null
)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  v_real_org_id uuid;
begin
  select organization_id into v_real_org_id
  from public.customers
  where id = p_customer_id;

  if not found then raise exception 'CUSTOMER_NOT_FOUND'; end if;
  if not public.has_organization_role(
    v_real_org_id,
    array['admin', 'manager']::public.member_role[]
  ) then raise exception 'UNAUTHORIZED'; end if;
  if char_length(btrim(p_type)) not between 1 and 100
    or char_length(btrim(p_reason)) not between 5 and 500
    or char_length(coalesce(p_reason_code, '')) > 100
    or p_type ~ '[[:cntrl:]]'
    or p_reason ~ '[[:cntrl:]]'
    or coalesce(p_reason_code, '') ~ '[[:cntrl:]]'
  then raise exception 'INVALID_RESTRICTION_INPUT'; end if;

  insert into public.customer_restrictions (
    organization_id, customer_id, module, restriction_type, scope,
    severity, reason, reason_code, created_by
  ) values (
    v_real_org_id, p_customer_id, p_module, btrim(p_type), p_scope,
    p_severity, btrim(p_reason), nullif(btrim(p_reason_code), ''), auth.uid()
  );
end;
$$;

create or replace function public.customer_release_restriction(
  p_org_id uuid,
  p_restriction_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  v_restriction public.customer_restrictions%rowtype;
begin
  select * into v_restriction
  from public.customer_restrictions
  where id = p_restriction_id;

  if not found then raise exception 'RESTRICTION_NOT_FOUND'; end if;
  if not public.has_organization_role(
    v_restriction.organization_id,
    array['admin', 'manager']::public.member_role[]
  ) then raise exception 'UNAUTHORIZED'; end if;
  if v_restriction.released_at is not null then raise exception 'ALREADY_RELEASED'; end if;
  if char_length(btrim(p_reason)) not between 5 and 500
    or p_reason ~ '[[:cntrl:]]'
  then raise exception 'INVALID_RELEASE_REASON'; end if;

  update public.customer_restrictions
  set released_at = now(),
      released_by = auth.uid(),
      release_reason = btrim(p_reason)
  where id = p_restriction_id
    and released_at is null;
end;
$$;

revoke all on function public.customer_apply_restriction(uuid, uuid, public.restriction_module, text, public.restriction_scope, public.restriction_severity, text, text) from public, anon;
revoke all on function public.customer_release_restriction(uuid, uuid, text) from public, anon;
grant execute on function public.customer_apply_restriction(uuid, uuid, public.restriction_module, text, public.restriction_scope, public.restriction_severity, text, text) to authenticated;
grant execute on function public.customer_release_restriction(uuid, uuid, text) to authenticated;

commit;
