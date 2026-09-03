# ERP Security Standards

Estas são as diretrizes máximas de Segurança do ERP.

## 1. Regra Máxima: O Browser Nunca é Autoridade

Nunca confiar nos seguintes dados quando enviados pelo frontend:
- `organization_id`
- `user_id`
- `created_by` / `approved_by`
- `customer_id` (para inferir `organization_id`)
- `role` / `permission`
- Total calculado
- Status calculado

**Padrão:** O backend recebe o ID da entidade (ex: `bank_transaction_id`), consulta o banco para descobrir a `organization_id` real e valida se o usuário autenticado pertence a ela.

## 2. Proteção em 3 Camadas

Toda entidade multi-tenant precisa ser protegida por:
1. `organization_id NOT NULL` no schema
2. RLS (Row Level Security)
3. Validação no domínio/RPC (`public.is_organization_member()`)

RLS não substitui regra de negócio. RPC não substitui RLS. Frontend não substitui nenhuma das duas.

## 3. SECURITY DEFINER hardening

Toda função `SECURITY DEFINER` deve **obrigatoriamente**:
1. Possuir `SET search_path = ''`.
2. Qualificar todos os objetos com schema (`public.orders`, `public.customers`).
3. Autenticar, resolver tenant pela entidade, verificar membership e roles ANTES de executar a operação.

## 4. Roles verificadas no Servidor E no Banco

Não basta usar `requireOrganizationRole` no Frontend/Server Action.
Operações sensíveis precisam ser protegidas por roles diretamente no banco (em RPCs ou RLS Policy).

## 5. Nada de DELETE para Fatos Históricos

Regra permanente. É estritamente **proibido** apagar dados de:
- `stock_movements`, `stock_reservations`
- `receivable_payments`
- `bank_transactions`, `bank_reconciliations`
- `invoice_events`, `business_events`, `audit_logs`
- `financial_transactions`

A correção de erros ocorre por: _reversal_, _cancellation_, _compensating event_ ou _supersede_.

## 6. Secrets nunca ficam em tabelas normais

Tokens, senhas, chaves de API e certificados **jamais** ficam em texto puro.
Devem usar `credentials_reference` apontando para um Vault seguro ou estarem cifrados no Postgres.
Nunca expor em variáveis `NEXT_PUBLIC_*`.
## Database Privileges
- Direct DML (INSERT, UPDATE, DELETE) is explicitly revoked for all authenticated and anon users on sensitive ledger tables (e.g. eceivable_payments, ank_transactions, invoices). Mutations happen exclusively via SECURITY DEFINER RPCs.

## Security Definer & Tenancy
- All SECURITY DEFINER functions MUST explicitly reset the search path via SET search_path = ''.
- Functions must extract the root entity first and derive the organization_id for authorization, never blindly trusting a client-provided parameter.
- Errors regarding access should prefer NOT_FOUND over UNAUTHORIZED when accessing cross-tenant entities to prevent enumeration.

## Cross-Site Scripting (XSS)
- Do NOT output absolute URLs directly from the database to the client. The database should return ction_code tokens, which the frontend routes safely internally (e.g. EDIT_PRODUCT_FISCAL).
- Any dynamic routing must run through safeInternalHref() utility to filter javascript: and protocol-relative // domains.
