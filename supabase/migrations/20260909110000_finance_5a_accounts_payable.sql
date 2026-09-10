-- Migration: Finance 5A - Accounts Payable Foundation (V5.4 - Final Gate)

create table if not exists public.idempotency_keys (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id) on delete cascade,
    idempotency_key text not null,
    command_type text not null,
    request_hash text not null,
    result_id uuid,
    created_at timestamptz not null default now(),
    unique (organization_id, idempotency_key)
);
alter table public.idempotency_keys enable row level security;
create policy "System internal access only" on public.idempotency_keys for all using (false);

create type public.payable_source_type as enum (
    'manual', 'purchase_order', 'supplier_invoice', 'tax', 'freight', 'expense', 'import', 'api'
);

create type public.payable_status as enum (
    'open', 'partially_paid', 'paid', 'cancelled'
);

create table if not exists public.accounts_payable (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id) on delete restrict,
    branch_id uuid,
    supplier_id uuid,
    supplier_name_snapshot text,
    supplier_document_snapshot text,
    document_number text,
    description text,
    source_type public.payable_source_type not null default 'manual',
    source_id uuid,
    source_external_id text,
    issued_on date not null default current_date,
    original_amount numeric(14,2) not null check (original_amount > 0),
    currency text not null default 'BRL',
    payment_term_id uuid,
    status public.payable_status not null default 'open',
    cancelled_at timestamptz,
    cancellation_reason text,
    created_by uuid,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (organization_id, id)
);

create unique index if not exists idx_accounts_payable_source_id on public.accounts_payable (organization_id, source_type, source_id) where source_id is not null;
create unique index if not exists idx_accounts_payable_source_ext on public.accounts_payable (organization_id, source_type, source_external_id) where source_external_id is not null;

alter table public.accounts_payable enable row level security;

create or replace function public.prevent_accounts_payable_delete() returns trigger as $$
begin raise exception 'accounts_payable historical records cannot be deleted. Use cancellation.'; end; $$ language plpgsql;
drop trigger if exists tr_prevent_ap_delete on public.accounts_payable;
create trigger tr_prevent_ap_delete before delete on public.accounts_payable for each row execute function public.prevent_accounts_payable_delete();

create table if not exists public.payable_installments (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null,
    payable_id uuid not null,
    installment_number int not null check (installment_number > 0),
    due_on date not null,
    original_amount numeric(14,2) not null check (original_amount > 0),
    remaining_amount numeric(14,2) not null check (remaining_amount >= 0),
    status public.payable_status not null default 'open',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (organization_id, id),
    unique (organization_id, payable_id, installment_number),
    foreign key (organization_id, payable_id) references public.accounts_payable(organization_id, id) on delete restrict,
    constraint check_remaining_amount check (remaining_amount <= original_amount)
);

alter table public.payable_installments enable row level security;

create or replace function public.prevent_payable_installments_delete() returns trigger as $$
begin raise exception 'payable_installments historical records cannot be deleted.'; end; $$ language plpgsql;
drop trigger if exists tr_prevent_inst_delete on public.payable_installments;
create trigger tr_prevent_inst_delete before delete on public.payable_installments for each row execute function public.prevent_payable_installments_delete();

create table if not exists public.payable_payments (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null,
    payable_id uuid not null,
    installment_id uuid not null,
    bank_account_id uuid,
    payment_method_id uuid,
    amount numeric(14,2) not null,
    payment_date date not null default current_date,
    reversal_of_id uuid references public.payable_payments(id) on delete restrict,
    created_by uuid,
    created_at timestamptz not null default now(),
    foreign key (organization_id, payable_id) references public.accounts_payable(organization_id, id) on delete restrict,
    foreign key (organization_id, installment_id) references public.payable_installments(organization_id, id) on delete restrict,
    check (
        (amount > 0 and reversal_of_id is null)
        or
        (amount < 0 and reversal_of_id is not null)
    )
);

create unique index if not exists idx_payable_payments_reversal on public.payable_payments (reversal_of_id) where reversal_of_id is not null;

create or replace function public.prevent_payable_payment_delete() returns trigger as $$
begin raise exception 'payable_payments is an append-only ledger. DELETE is not allowed.'; end; $$ language plpgsql;
drop trigger if exists tr_prevent_payable_payment_delete on public.payable_payments;
create trigger tr_prevent_payable_payment_delete before delete on public.payable_payments for each row execute function public.prevent_payable_payment_delete();

create or replace function public.prevent_payable_payment_update() returns trigger as $$
begin raise exception 'payable_payments is an append-only ledger. UPDATE is strictly forbidden.'; end; $$ language plpgsql;
drop trigger if exists tr_prevent_payable_payment_update on public.payable_payments;
create trigger tr_prevent_payable_payment_update before update on public.payable_payments for each row execute function public.prevent_payable_payment_update();

alter table public.payable_payments enable row level security;

revoke insert, update, delete on public.accounts_payable from authenticated;
revoke insert, update, delete on public.payable_installments from authenticated;
revoke insert, update, delete on public.payable_payments from authenticated;
