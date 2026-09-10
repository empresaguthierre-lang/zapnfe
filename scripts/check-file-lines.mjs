import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const MAX_LINES = 1000;
const roots = ["src", "scripts"];
const extensions = new Set([".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx"]);
const ignoredDirectories = new Set(["node_modules", ".next", "coverage", "outputs", "zap-reports"]);
const violations = [];

async function visit(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (ignoredDirectories.has(entry.name)) continue;
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await visit(filePath);
      continue;
    }
    if (!extensions.has(path.extname(entry.name))) continue;
    const contents = await readFile(filePath, "utf8");
    const lineCount = contents.split(/\r?\n/).length;
    if (lineCount > MAX_LINES) violations.push({ filePath, lineCount });
  }
}

for (const root of roots) await visit(root);

if (violations.length > 0) {
  for (const item of violations) console.error(`${item.filePath}: ${item.lineCount} linhas`);
  process.exit(1);
}

console.log(`Limite de ${MAX_LINES} linhas validado.`);
