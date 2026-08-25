import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";

const root = process.cwd();
const extensions = new Set([".js", ".jsx", ".ts", ".tsx"]);
const excluded = new Set([".git", ".next", "node_modules", "out", "build"]);
const violations = [];

async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (excluded.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await walk(path);
    else if (extensions.has(extname(entry.name))) {
      const lines = (await readFile(path, "utf8")).split(/\r?\n/).length;
      if (lines > 1000) violations.push(`${relative(root, path)}: ${lines} linhas`);
    }
  }
}

await walk(join(root, "src"));
if (violations.length) {
  console.error("Arquivos acima do limite de 1000 linhas:\n" + violations.join("\n"));
  process.exit(1);
}
console.log("Limite de 1000 linhas validado.");
