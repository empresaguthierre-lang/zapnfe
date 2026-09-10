import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("Finance 5A - Contract & Invariant Suite", async (t) => {
  const migrationsDir = path.join(process.cwd(), "supabase", "migrations");
  const schemaMigrationFile = fs.readdirSync(migrationsDir).find((f) => f.includes("finance_5a_accounts_payable.sql"));
  const rpcMigrationFile = fs.readdirSync(migrationsDir).find((f) => f.includes("finance_5a_rpcs.sql"));
  const hardeningMigrationFile = fs.readdirSync(migrationsDir).find((f) => f.includes("finance_5a_hardening.sql"));

  assert.ok(schemaMigrationFile, "Schema migration file must exist");
  assert.ok(rpcMigrationFile, "RPC migration file must exist");
  assert.ok(hardeningMigrationFile, "Hardening migration file must exist");

  const schemaSql = fs.readFileSync(path.join(migrationsDir, schemaMigrationFile), "utf-8");
  const rpcSql = fs.readFileSync(path.join(migrationsDir, rpcMigrationFile), "utf-8");
  const hardeningSql = fs.readFileSync(path.join(migrationsDir, hardeningMigrationFile), "utf-8");
  const combinedSql = schemaSql + "\n" + rpcSql + "\n" + hardeningSql;

  await t.test("IDEMPOTENCY: Mandatory idempotency key check in all RPCs", () => {
    const requiredChecks = [
      "if idempotency_key is null or btrim(idempotency_key) = '' then",
      "raise exception 'IDEMPOTENCY_KEY_REQUIRED';"
    ];
    for (const check of requiredChecks) {
      assert.ok(combinedSql.includes(check), `Missing mandatory idempotency check: ${check}`);
    }
  });

  await t.test("IDEMPOTENCY: Canonical SHA-256 hashing and command_type binding", () => {
    assert.ok(combinedSql.includes("encode(digest(payload::text, 'sha256'), 'hex')"), "Must hash payload using SHA-256");
    assert.ok(combinedSql.includes("uq_idempotency_keys_org_key_command"), "Must bind idempotency to (org, key, command_type)");
    assert.ok(combinedSql.includes("v_existing_cmd <> 'payable.create'"), "Must check command_type on create");
    assert.ok(combinedSql.includes("v_existing_cmd <> 'payable.payment'"), "Must check command_type on payment");
    assert.ok(combinedSql.includes("v_existing_cmd <> 'payable.reverse'"), "Must check command_type on reverse");
    assert.ok(combinedSql.includes("v_existing_cmd <> 'payable.cancel'"), "Must check command_type on cancel");
  });

  await t.test("BUSINESS EVENTS: Contract adheres strictly to ARCHITECTURE.md", () => {
    // Contract: event_type, schema_version (1), organization_id, actor_id, entity_type, entity_id, occurred_at, payload
    const eventContractPattern = /insert into public\.business_events\s*\(\s*event_type,\s*schema_version,\s*organization_id,\s*actor_id,\s*entity_type,\s*entity_id,\s*occurred_at,\s*payload/i;
    assert.ok(eventContractPattern.test(hardeningSql), "business_events insert must match ARCHITECTURE.md contract");

    assert.ok(hardeningSql.includes("'finance.payable.created.v1'"), "Must emit created event");
    assert.ok(hardeningSql.includes("'finance.payable.payment_registered.v1'"), "Must emit payment_registered event");
    assert.ok(hardeningSql.includes("'finance.payable.payment_reversed.v1'"), "Must emit payment_reversed event");
    assert.ok(hardeningSql.includes("'finance.payable.cancelled.v1'"), "Must emit cancelled event");
  });

  await t.test("LEDGER: Append-only immutability and compensation reversal constraints", () => {
    assert.ok(combinedSql.includes("prevent_payable_payment_delete"), "Must have trigger blocking DELETE on payments");
    assert.ok(combinedSql.includes("prevent_payable_payment_update"), "Must have trigger blocking UPDATE on payments");
    assert.ok(combinedSql.includes("prevent_accounts_payable_delete"), "Must have trigger blocking DELETE on payables");
    assert.ok(combinedSql.includes("prevent_payable_installments_delete"), "Must have trigger blocking DELETE on installments");
    assert.ok(combinedSql.includes("amount < 0 and reversal_of_id is not null"), "Reversal must enforce negative amount and parent pointer");
    assert.ok(combinedSql.includes("idx_payable_payments_reversal"), "Must have unique index on reversal_of_id to prevent double reversal");
  });

  await t.test("PHYSICAL INTEGRITY: Compound foreign keys and cross-entity consistency", () => {
    assert.ok(hardeningSql.includes("foreign key (organization_id, payable_id, installment_id)"), "Must physically link payment to installment of the exact same payable");
    assert.ok(hardeningSql.includes("foreign key (organization_id, branch_id)"), "Must enforce tenant-aware branch FK");
    assert.ok(hardeningSql.includes("foreign key (organization_id, supplier_id)"), "Must enforce tenant-aware supplier FK");
    assert.ok(hardeningSql.includes("foreign key (organization_id, payment_term_id)"), "Must enforce tenant-aware payment_term FK");
    assert.ok(hardeningSql.includes("foreign key (organization_id, bank_account_id)"), "Must enforce tenant-aware bank_account FK");
    assert.ok(hardeningSql.includes("foreign key (organization_id, payment_method_id)"), "Must enforce tenant-aware payment_method FK");
  });

  await t.test("AUDIT LOGS: Triggers attached to financial entities", () => {
    assert.ok(hardeningSql.includes("tr_audit_accounts_payable"), "Must attach audit trigger to accounts_payable");
    assert.ok(hardeningSql.includes("tr_audit_payable_installments"), "Must attach audit trigger to payable_installments");
    assert.ok(hardeningSql.includes("tr_audit_payable_payments"), "Must attach audit trigger to payable_payments");
  });

  await t.test("INDEXES: Scale indexes for payable_id and installment_id", () => {
    assert.ok(hardeningSql.includes("idx_payable_installments_payable_id"), "Index on payable_installments(payable_id) must exist");
    assert.ok(hardeningSql.includes("idx_payable_payments_payable_id"), "Index on payable_payments(payable_id) must exist");
    assert.ok(hardeningSql.includes("idx_payable_payments_installment_id"), "Index on payable_payments(installment_id) must exist");
  });
});
