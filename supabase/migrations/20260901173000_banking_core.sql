begin;

-- 1. Expanded Bank Accounts
alter table public.bank_accounts
add column if not exists bank_code text,
add column if not exists branch_number text,
add column if not exists branch_digit text,
add column if not exists account_number text,
add column if not exists account_digit text,
add column if not exists account_kind text,
add column if not exists opening_balance numeric not null default 0;

-- 2. Bank Statement Imports
create table public.bank_statement_imports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  bank_account_id uuid not null references public.bank_accounts(id) on delete restrict,

  source_type text not null, -- ofx, csv, api, manual
  file_name text,
  file_hash text,

  period_start date,
  period_end date,

  records_total int not null default 0,
  records_imported int not null default 0,
  records_duplicated int not null default 0,
  records_failed int not null default 0,

  status text not null default 'completed',

  imported_by uuid not null references auth.users(id) on delete restrict,
  imported_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
alter table public.bank_statement_imports enable row level security;
create policy bnk_imp_org on public.bank_statement_imports for all to authenticated using (public.is_organization_member(organization_id));

create unique index unq_bank_import_hash on public.bank_statement_imports(organization_id, bank_account_id, file_hash) where file_hash is not null;

-- 3. Bank Transactions
create type public.bank_transaction_status as enum (
  'unmatched',
  'suggested',
  'partially_reconciled',
  'reconciled',
  'ignored'
);

create table public.bank_transactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  bank_account_id uuid not null references public.bank_accounts(id) on delete restrict,
  statement_import_id uuid references public.bank_statement_imports(id) on delete set null,

  external_id text,
  fingerprint text not null,

  posted_on date not null,
  occurred_at timestamptz,

  amount numeric not null check(amount > 0),
  direction text not null check(direction in ('credit', 'debit')),
  transaction_type text,

  description text not null,
  memo text,
  document_reference text,

  counterparty_name text,
  counterparty_document text,

  allocated_amount numeric not null default 0 check(allocated_amount >= 0),
  remaining_amount numeric not null,
  status public.bank_transaction_status not null default 'unmatched',

  metadata jsonb,
  created_at timestamptz not null default now()
);
alter table public.bank_transactions enable row level security;
create policy bnk_txn_org on public.bank_transactions for all to authenticated using (public.is_organization_member(organization_id));

create unique index unq_bank_txn_fingerprint on public.bank_transactions(organization_id, bank_account_id, fingerprint);

-- 4. Financial Transactions (Generic Ledger)
create table public.financial_transactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,

  transaction_kind text not null, -- bank_fee, interest, discount, generic_expense, generic_income
  amount numeric not null check(amount > 0),
  direction text not null check(direction in ('credit', 'debit')),

  occurred_at timestamptz not null,
  description text,
  reference_id uuid,

  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.financial_transactions enable row level security;
create policy fin_txn_org on public.financial_transactions for all to authenticated using (public.is_organization_member(organization_id));

-- 5. Internal Bank Transfers
create table public.internal_bank_transfers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,

  source_bank_account_id uuid not null references public.bank_accounts(id) on delete restrict,
  target_bank_account_id uuid not null references public.bank_accounts(id) on delete restrict,

  source_bank_transaction_id uuid references public.bank_transactions(id) on delete restrict,
  target_bank_transaction_id uuid references public.bank_transactions(id) on delete restrict,

  amount numeric not null check(amount > 0),
  status text not null default 'completed',

  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.internal_bank_transfers enable row level security;
create policy int_trf_org on public.internal_bank_transfers for all to authenticated using (public.is_organization_member(organization_id));

-- 6. Bank Reconciliations (N:N Junction)
create table public.bank_reconciliations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  bank_transaction_id uuid not null references public.bank_transactions(id) on delete restrict,

  status text not null default 'active', -- active, reversed

  reconciled_by uuid not null references auth.users(id) on delete restrict,
  reconciled_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
alter table public.bank_reconciliations enable row level security;
create policy bnk_rec_org on public.bank_reconciliations for all to authenticated using (public.is_organization_member(organization_id));

create table public.bank_reconciliation_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  reconciliation_id uuid not null references public.bank_reconciliations(id) on delete cascade,
  bank_transaction_id uuid not null references public.bank_transactions(id) on delete restrict,

  target_type text not null, -- receivable_installment, bank_fee, internal_transfer
  target_id uuid not null,

  bank_amount numeric not null check (bank_amount > 0),
  economic_amount numeric not null check (economic_amount > 0),

  created_at timestamptz not null default now()
);
alter table public.bank_reconciliation_items enable row level security;
create policy bnk_rec_itm_org on public.bank_reconciliation_items for all to authenticated using (public.is_organization_member(organization_id));

commit;
