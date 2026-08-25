create extension if not exists pgcrypto;
create type public.member_role as enum ('admin', 'manager', 'operator');
create type public.order_status as enum ('received', 'review', 'invoiced', 'completed', 'cancelled');
create type public.message_processing_status as enum ('received', 'processing', 'processed', 'failed', 'ignored');

create table public.organizations (id uuid primary key default gen_random_uuid(), name text not null check (char_length(trim(name)) between 2 and 120), slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'), active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.organization_members (organization_id uuid not null references public.organizations(id) on delete cascade, user_id uuid not null references auth.users(id) on delete cascade, role public.member_role not null default 'operator', created_at timestamptz not null default now(), primary key (organization_id, user_id));
create table public.whatsapp_accounts (id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade, phone_number_id text not null unique, waba_id text, display_phone_number text, active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.customers (id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade, name text not null check (char_length(trim(name)) between 2 and 160), phone text not null, document text, active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (organization_id, phone));
create table public.products (id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade, sku text not null, name text not null check (char_length(trim(name)) between 2 and 180), aliases text[] not null default '{}', unit text not null default 'UN', price numeric(14,2) not null default 0 check (price >= 0), active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (organization_id, sku));
create table public.whatsapp_inbound_messages (id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade, whatsapp_account_id uuid not null references public.whatsapp_accounts(id) on delete restrict, provider_message_id text not null unique, sender_phone text not null, sender_name text, message_type text not null, body text, provider_timestamp timestamptz, raw_payload jsonb not null, processing_status public.message_processing_status not null default 'received', processing_error text, extraction jsonb, created_at timestamptz not null default now(), processed_at timestamptz);
create table public.orders (id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade, customer_id uuid references public.customers(id) on delete set null, inbound_message_id uuid not null unique references public.whatsapp_inbound_messages(id) on delete restrict, number bigint generated always as identity, status public.order_status not null default 'review', source text not null default 'whatsapp', raw_message text not null, notes text, extraction_confidence numeric(5,4) check (extraction_confidence between 0 and 1), subtotal numeric(14,2) not null default 0, discount numeric(14,2) not null default 0 check (discount >= 0), freight numeric(14,2) not null default 0 check (freight >= 0), total numeric(14,2) not null default 0, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.order_items (id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade, order_id uuid not null references public.orders(id) on delete cascade, product_id uuid references public.products(id) on delete set null, description text not null, quantity numeric(14,3) not null check (quantity > 0), unit text not null default 'UN', unit_price numeric(14,2) not null default 0 check (unit_price >= 0), total numeric(14,2) not null default 0 check (total >= 0), match_confidence numeric(5,4) check (match_confidence between 0 and 1), needs_review boolean not null default true, created_at timestamptz not null default now());

create index organization_members_user_idx on public.organization_members(user_id, organization_id);
create index customers_org_name_idx on public.customers(organization_id, lower(name));
create index products_org_name_idx on public.products(organization_id, lower(name));
create index messages_org_created_idx on public.whatsapp_inbound_messages(organization_id, created_at desc);
create index orders_org_created_idx on public.orders(organization_id, created_at desc);
create index orders_org_status_idx on public.orders(organization_id, status);
create index order_items_order_idx on public.order_items(order_id);

create or replace function public.set_updated_at() returns trigger language plpgsql set search_path = '' as $$ begin new.updated_at = now(); return new; end; $$;
create trigger organizations_set_updated_at before update on public.organizations for each row execute function public.set_updated_at();
create trigger whatsapp_accounts_set_updated_at before update on public.whatsapp_accounts for each row execute function public.set_updated_at();
create trigger customers_set_updated_at before update on public.customers for each row execute function public.set_updated_at();
create trigger products_set_updated_at before update on public.products for each row execute function public.set_updated_at();
create trigger orders_set_updated_at before update on public.orders for each row execute function public.set_updated_at();

create or replace function public.is_organization_member(target_organization_id uuid) returns boolean language sql stable security definer set search_path = '' as $$ select exists (select 1 from public.organization_members m where m.organization_id = target_organization_id and m.user_id = (select auth.uid())); $$;
create or replace function public.has_organization_role(target_organization_id uuid, allowed_roles public.member_role[]) returns boolean language sql stable security definer set search_path = '' as $$ select exists (select 1 from public.organization_members m where m.organization_id = target_organization_id and m.user_id = (select auth.uid()) and m.role = any(allowed_roles)); $$;

create or replace function public.create_order_from_whatsapp(target_message_id uuid, extracted_customer_name text, extracted_notes text, extracted_confidence numeric, extracted_items jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare inbound public.whatsapp_inbound_messages; existing_order_id uuid; resolved_customer_id uuid; created_order_id uuid; item jsonb; resolved_product public.products; item_quantity numeric; item_price numeric;
begin
  select * into inbound from public.whatsapp_inbound_messages where id = target_message_id for update;
  if not found then raise exception 'Inbound message not found'; end if;
  select id into existing_order_id from public.orders where inbound_message_id = inbound.id;
  if existing_order_id is not null then return existing_order_id; end if;
  update public.whatsapp_inbound_messages set processing_status = 'processing', processing_error = null where id = inbound.id;
  insert into public.customers (organization_id, name, phone) values (inbound.organization_id, coalesce(nullif(trim(extracted_customer_name), ''), inbound.sender_name, inbound.sender_phone), inbound.sender_phone)
  on conflict (organization_id, phone) do update set name = case when public.customers.name = public.customers.phone then excluded.name else public.customers.name end, updated_at = now() returning id into resolved_customer_id;
  insert into public.orders (organization_id, customer_id, inbound_message_id, raw_message, notes, extraction_confidence) values (inbound.organization_id, resolved_customer_id, inbound.id, coalesce(inbound.body, ''), extracted_notes, extracted_confidence) returning id into created_order_id;
  for item in select value from jsonb_array_elements(extracted_items) loop
    resolved_product := null;
    if nullif(item->>'product_id', '') is not null then select * into resolved_product from public.products where id = (item->>'product_id')::uuid and organization_id = inbound.organization_id and active; end if;
    item_quantity := greatest(coalesce((item->>'quantity')::numeric, 0), 0); if item_quantity = 0 then continue; end if; item_price := coalesce(resolved_product.price, 0);
    insert into public.order_items (organization_id, order_id, product_id, description, quantity, unit, unit_price, total, match_confidence, needs_review)
    values (inbound.organization_id, created_order_id, resolved_product.id, coalesce(nullif(item->>'description', ''), resolved_product.name, 'Item não identificado'), item_quantity, coalesce(nullif(item->>'unit', ''), resolved_product.unit, 'UN'), item_price, round(item_quantity * item_price, 2), coalesce((item->>'match_confidence')::numeric, 0), resolved_product.id is null or coalesce((item->>'match_confidence')::numeric, 0) < 0.85);
  end loop;
  update public.orders target set subtotal = totals.value, total = totals.value from (select coalesce(sum(total), 0) value from public.order_items where order_id = created_order_id) totals where target.id = created_order_id;
  update public.whatsapp_inbound_messages set processing_status = 'processed', processed_at = now() where id = inbound.id;
  return created_order_id;
end; $$;

revoke all on function public.is_organization_member(uuid) from public, anon;
revoke all on function public.has_organization_role(uuid, public.member_role[]) from public, anon;
grant execute on function public.is_organization_member(uuid) to authenticated, service_role;
grant execute on function public.has_organization_role(uuid, public.member_role[]) to authenticated, service_role;
revoke all on function public.create_order_from_whatsapp(uuid, text, text, numeric, jsonb) from public, anon, authenticated;
grant execute on function public.create_order_from_whatsapp(uuid, text, text, numeric, jsonb) to service_role;

alter table public.organizations enable row level security; alter table public.organization_members enable row level security; alter table public.whatsapp_accounts enable row level security; alter table public.customers enable row level security; alter table public.products enable row level security; alter table public.whatsapp_inbound_messages enable row level security; alter table public.orders enable row level security; alter table public.order_items enable row level security;
revoke all on all tables in schema public from anon, authenticated;
grant select on public.organizations, public.organization_members, public.whatsapp_accounts, public.whatsapp_inbound_messages, public.orders, public.order_items to authenticated;
grant select, insert, update on public.customers, public.products to authenticated;
grant usage, select on all sequences in schema public to authenticated;
create policy organizations_select on public.organizations for select to authenticated using (public.is_organization_member(id));
create policy members_select on public.organization_members for select to authenticated using (public.is_organization_member(organization_id));
create policy whatsapp_accounts_select on public.whatsapp_accounts for select to authenticated using (public.is_organization_member(organization_id));
create policy customers_select on public.customers for select to authenticated using (public.is_organization_member(organization_id));
create policy customers_insert on public.customers for insert to authenticated with check (public.has_organization_role(organization_id, array['admin','manager','operator']::public.member_role[]));
create policy customers_update on public.customers for update to authenticated using (public.has_organization_role(organization_id, array['admin','manager','operator']::public.member_role[])) with check (public.has_organization_role(organization_id, array['admin','manager','operator']::public.member_role[]));
create policy products_select on public.products for select to authenticated using (public.is_organization_member(organization_id));
create policy products_insert on public.products for insert to authenticated with check (public.has_organization_role(organization_id, array['admin','manager']::public.member_role[]));
create policy products_update on public.products for update to authenticated using (public.has_organization_role(organization_id, array['admin','manager']::public.member_role[])) with check (public.has_organization_role(organization_id, array['admin','manager']::public.member_role[]));
create policy messages_select on public.whatsapp_inbound_messages for select to authenticated using (public.is_organization_member(organization_id));
create policy orders_select on public.orders for select to authenticated using (public.is_organization_member(organization_id));
create policy order_items_select on public.order_items for select to authenticated using (public.is_organization_member(organization_id));
comment on function public.create_order_from_whatsapp is 'Creates an idempotent review order from a persisted WhatsApp message. Service role only.';
