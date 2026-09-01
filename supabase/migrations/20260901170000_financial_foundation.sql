begin;

-- Enums
create type public.bank_account_kind as enum ('checking', 'savings', 'cash', 'payment', 'other');
create type public.financial_entry_type as enum ('revenue', 'expense');
create type public.receivable_status as enum ('draft', 'open', 'partially_paid', 'paid', 'cancelled', 'written_off');

-- 1. Cadastros Básicos

create table public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text not null,
  name text not null,
  kind text not null,
  requires_bank_account boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.payment_methods enable row level security;
create policy p_methods_org on public.payment_methods for all to authenticated using (public.is_organization_member(organization_id));

create table public.payment_terms (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text not null,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.payment_terms enable row level security;
create policy p_terms_org on public.payment_terms for all to authenticated using (public.is_organization_member(organization_id));

create table public.payment_term_installments (
  id uuid primary key default gen_random_uuid(),
  payment_term_id uuid not null references public.payment_terms(id) on delete cascade,
  installment_number int not null,
  days_after_origin int not null,
  percentage numeric not null check(percentage > 0 and percentage <= 100),
  created_at timestamptz not null default now()
);
alter table public.payment_term_installments enable row level security;
create policy p_term_inst_org on public.payment_term_installments for select to authenticated using (
  exists (select 1 from public.payment_terms pt where pt.id = payment_term_installments.payment_term_id and public.is_organization_member(pt.organization_id))
);

create table public.bank_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete set null,
  bank_code text,
  bank_name text,
  account_name text not null,
  branch_number text,
  branch_digit text,
  account_number text,
  account_digit text,
  account_kind public.bank_account_kind not null default 'checking',
  opening_balance numeric not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.bank_accounts enable row level security;
create policy bank_acc_org on public.bank_accounts for all to authenticated using (public.is_organization_member(organization_id));

create table public.financial_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  parent_id uuid references public.financial_categories(id) on delete restrict,
  code text not null,
  name text not null,
  type public.financial_entry_type not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.financial_categories enable row level security;
create policy fin_cat_org on public.financial_categories for all to authenticated using (public.is_organization_member(organization_id));

create table public.cost_centers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  parent_id uuid references public.cost_centers(id) on delete restrict,
  code text not null,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.cost_centers enable row level security;
create policy cost_ctr_org on public.cost_centers for all to authenticated using (public.is_organization_member(organization_id));

-- 2. Títulos, Parcelas e Pagamentos

create table public.accounts_receivable (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete set null,
  customer_id uuid not null references public.customers(id) on delete restrict,

  source_type text not null, -- 'order', 'invoice', 'manual', 'contract', etc
  source_id uuid,

  document_number text,
  description text,

  original_amount numeric not null,
  current_amount numeric not null,

  payment_method_id uuid references public.payment_methods(id) on delete restrict,
  payment_term_id uuid references public.payment_terms(id) on delete restrict,

  status public.receivable_status not null default 'open',
  issued_on date not null default current_date,
  competence_date date not null default current_date,
  currency text not null default 'BRL',

  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.accounts_receivable enable row level security;
create policy acc_recv_org on public.accounts_receivable for all to authenticated using (public.is_organization_member(organization_id));

create table public.receivable_installments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  receivable_id uuid not null references public.accounts_receivable(id) on delete cascade,

  installment_number int not null,
  original_amount numeric not null,
  open_amount numeric not null,

  due_on date not null,
  status public.receivable_status not null default 'open',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint positive_open check (open_amount >= 0)
);
alter table public.receivable_installments enable row level security;
create policy recv_inst_org on public.receivable_installments for all to authenticated using (public.is_organization_member(organization_id));

create table public.receivable_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete set null,
  receivable_id uuid not null references public.accounts_receivable(id) on delete restrict,
  installment_id uuid not null references public.receivable_installments(id) on delete restrict,
  bank_account_id uuid not null references public.bank_accounts(id) on delete restrict,
  payment_method_id uuid references public.payment_methods(id) on delete set null,

  amount numeric not null,
  principal_amount numeric not null,
  interest_amount numeric not null default 0,
  penalty_amount numeric not null default 0,
  discount_amount numeric not null default 0,

  paid_at timestamptz not null default now(),
  reference text,
  notes text,

  reversal_of_id uuid references public.receivable_payments(id) on delete restrict,

  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),

  -- The constraint ensures the math checks out perfectly for the receipt.
  constraint valid_payment_amount check (amount = principal_amount + interest_amount + penalty_amount - discount_amount)
);
alter table public.receivable_payments enable row level security;
create policy recv_pay_org on public.receivable_payments for all to authenticated using (public.is_organization_member(organization_id));

-- Prevent double reversals
create unique index unq_reversal_payment on public.receivable_payments(reversal_of_id) where reversal_of_id is not null;

create table public.financial_allocations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  transaction_id uuid not null, -- polymorphic to receivable_payments, payable_payments, etc
  transaction_type text not null,
  cost_center_id uuid not null references public.cost_centers(id) on delete restrict,
  percentage numeric not null,
  amount numeric not null,
  created_at timestamptz not null default now()
);
alter table public.financial_allocations enable row level security;
create policy fin_alloc_org on public.financial_allocations for all to authenticated using (public.is_organization_member(organization_id));

-- 3. Inteligência e Risco

create table public.financial_risk_policies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,

  warning_late_installments int not null default 2,
  warning_average_delay_days int not null default 5,
  critical_late_installments int not null default 3,
  critical_min_overdue_days int not null default 15,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id)
);
alter table public.financial_risk_policies enable row level security;
create policy risk_pol_org on public.financial_risk_policies for all to authenticated using (public.is_organization_member(organization_id));

create table public.customer_financial_metrics (
  customer_id uuid not null references public.customers(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,

  total_original_amount numeric not null default 0,
  total_received_amount numeric not null default 0,
  open_amount numeric not null default 0,
  overdue_amount numeric not null default 0,

  installments_count int not null default 0,
  paid_installments int not null default 0,
  late_installments int not null default 0,
  on_time_installments int not null default 0,

  on_time_rate numeric not null default 0,
  average_delay_days numeric not null default 0,
  max_delay_days int not null default 0,
  average_delay_last_3 numeric not null default 0,
  average_delay_last_6 numeric not null default 0,

  oldest_overdue_on date,
  last_payment_at timestamptz,
  last_recalculated_at timestamptz not null default now(),

  primary key (organization_id, customer_id)
);
alter table public.customer_financial_metrics enable row level security;
create policy cust_fin_metrics_org on public.customer_financial_metrics for all to authenticated using (public.is_organization_member(organization_id));

commit;
