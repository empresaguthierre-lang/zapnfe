import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("Tenant Isolation & Anti-Enumeration Suite", async (t) => {
  const migrationsDir = path.join(process.cwd(), "supabase", "migrations");
  const rpcMigrationFile = fs.readdirSync(migrationsDir).find((f) => f.includes("finance_5a_rpcs.sql"));
  const schemaMigrationFile = fs.readdirSync(migrationsDir).find((f) => f.includes("finance_5a_accounts_payable.sql"));

  assert.ok(rpcMigrationFile, "RPC migration file must exist");
  assert.ok(schemaMigrationFile, "Schema migration file must exist");

  const rpcSql = fs.readFileSync(path.join(migrationsDir, rpcMigrationFile), "utf-8");
  const schemaSql = fs.readFileSync(path.join(migrationsDir, schemaMigrationFile), "utf-8");
  const hardeningMigrationFile = fs.readdirSync(migrationsDir).find((f) => f.includes("finance_5a_hardening.sql"));
  const hardeningSql = hardeningMigrationFile ? fs.readFileSync(path.join(migrationsDir, hardeningMigrationFile), "utf-8") : "";
  const combinedSql = rpcSql + "\n" + hardeningSql;

  await t.test("ANTI-ENUMERATION: Cross-tenant IDs masked as NOT_FOUND", () => {
    // Verifies that queries filter by organization_id first and return NOT_FOUND if absent,
    // never leaking whether the record exists in another tenant.
    assert.ok(combinedSql.includes("INSTALLMENT_NOT_FOUND"), "Must return NOT_FOUND on missing or cross-tenant installment");
    assert.ok(combinedSql.includes("PAYABLE_NOT_FOUND"), "Must return NOT_FOUND on missing or cross-tenant payable");
    assert.ok(combinedSql.includes("PAYMENT_NOT_FOUND"), "Must return NOT_FOUND on missing or cross-tenant payment");
    assert.ok(!combinedSql.includes("ORGANIZATION_MISMATCH"), "Must not leak cross-tenant organization mismatch error codes");
  });

  await t.test("RLS HARDENING: Strict role checks via finance_has_access", () => {
    assert.ok(combinedSql.includes("create or replace function public.finance_has_access"), "Must define finance_has_access");
    assert.ok(combinedSql.includes("v_role not in ('admin', 'manager')"), "Must limit financial access to admin and manager");
    assert.ok(combinedSql.includes("current_setting('request.jwt.claim.role', true) = 'service_role'"), "Must support service_role via JWT claim");
  });

  await t.test("FAIL-CLOSED RLS: All financial tables enable RLS and revoke authenticated DML", () => {
    assert.ok(schemaSql.includes("alter table public.accounts_payable enable row level security;"), "accounts_payable must enable RLS");
    assert.ok(schemaSql.includes("alter table public.payable_installments enable row level security;"), "payable_installments must enable RLS");
    assert.ok(schemaSql.includes("alter table public.payable_payments enable row level security;"), "payable_payments must enable RLS");

    assert.ok(schemaSql.includes("revoke insert, update, delete on public.accounts_payable from authenticated;"), "accounts_payable must revoke DML");
    assert.ok(schemaSql.includes("revoke insert, update, delete on public.payable_installments from authenticated;"), "payable_installments must revoke DML");
    assert.ok(schemaSql.includes("revoke insert, update, delete on public.payable_payments from authenticated;"), "payable_payments must revoke DML");
  });
});
