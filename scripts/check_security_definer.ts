import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

type Definition = { file: string; functionName: string; header: string };

async function main() {
  const migrationsDirectory = path.join(process.cwd(), "supabase", "migrations");
  const migrationFiles = (await readdir(migrationsDirectory))
    .filter((file) => file.endsWith(".sql"))
    .sort();
  const latestDefinitions = new Map<string, Definition>();

  for (const file of migrationFiles) {
    const sql = await readFile(path.join(migrationsDirectory, file), "utf8");
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
    !/set\s+search_path\s*=\s*(?:''|pg_catalog(?:\s*,\s*public)?)/i.test(header),
  );

  if (insecure.length > 0) {
    for (const item of insecure) {
      console.error(`${item.file}: public.${item.functionName} não fixa search_path.`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(`${latestDefinitions.size} definições finais verificadas; nenhum SECURITY DEFINER inseguro.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Falha ao verificar migrations.");
  process.exitCode = 1;
});
