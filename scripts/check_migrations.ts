import fs from "node:fs";
import path from "node:path";

const MIGRATIONS_DIR = path.join(process.cwd(), "supabase", "migrations");

function checkMigrations() {
  console.log("Auditing Supabase migrations...");
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
  let failed = false;

  // 1. Filename pattern & chronological order
  const pattern = /^(\d{14})_(.+)\.sql$/;
  let prevTimestamp = "";

  for (const file of files) {
    const match = file.match(pattern);
    if (!match) {
      console.error(`[FAIL - Invalid Name]: ${file} does not match timestamp format YYYYMMDDHHMMSS_name.sql`);
      failed = true;
      continue;
    }
    const timestamp = match[1];
    if (timestamp < prevTimestamp) {
      console.error(`[FAIL - Timestamp Out of Order]: ${file} (${timestamp}) is before previous (${prevTimestamp})`);
      failed = true;
    }
    prevTimestamp = timestamp;
  }

  // 2. Audit Final State of SECURITY DEFINER functions (tracking overrides/alterations)
  type Definition = { file: string; functionName: string; header: string };
  const latestDefinitions = new Map<string, Definition>();

  for (const file of files) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    const definitionPattern = /create\s+(?:or\s+replace\s+)?function\s+public\.([a-zA-Z0-9_]+)\s*\([\s\S]*?\)\s*returns[\s\S]*?\bas\s+\$[^$]*\$/gi;
    for (const match of sql.matchAll(definitionPattern)) {
      latestDefinitions.set(match[1].toLowerCase(), {
        file,
        functionName: match[1],
        header: match[0],
      });
    }
    const hardenedPattern = /alter\s+function\s+public\.([a-zA-Z0-9_]+)\s*\([\s\S]*?\)\s+set\s+search_path\s*=\s*(?:''|pg_catalog(?:\s*,\s*public)?)/gi;
    for (const match of sql.matchAll(hardenedPattern)) {
      const current = latestDefinitions.get(match[1].toLowerCase());
      if (current) current.header += " set search_path = ''";
    }
  }

  const insecure = [...latestDefinitions.values()].filter(({ header }) =>
    /security\s+definer/i.test(header) &&
    !/set\s+search_path\s*=\s*(?:''|pg_catalog(?:\s*,\s*public)?)/i.test(header)
  );

  if (insecure.length > 0) {
    for (const item of insecure) {
      console.error(`[FAIL - Insecure SECURITY DEFINER]: ${item.file}: public.${item.functionName} does not fix search_path.`);
    }
    failed = true;
  }

  // 3. Audit Ledger DML revocation
  const apMigration = files.find((f) => f.includes("finance_5a_accounts_payable"));
  if (apMigration) {
    const content = fs.readFileSync(path.join(MIGRATIONS_DIR, apMigration), "utf-8");
    if (!content.includes("revoke insert, update, delete on public.accounts_payable from authenticated")) {
      console.error(`[FAIL - DML Not Revoked]: accounts_payable must revoke DML from authenticated in ${apMigration}`);
      failed = true;
    }
    if (!content.includes("revoke insert, update, delete on public.payable_payments from authenticated")) {
      console.error(`[FAIL - DML Not Revoked]: payable_payments must revoke DML from authenticated in ${apMigration}`);
      failed = true;
    }
  }

  if (failed) {
    console.error("Migration audit FAILED.");
    process.exit(1);
  } else {
    console.log(`Migration audit PASSED. Verified ${files.length} migrations and ${latestDefinitions.size} functions.`);
  }
}

checkMigrations();
