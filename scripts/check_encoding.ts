import fs from "node:fs";
import path from "node:path";

const EXTENSIONS = [".sql", ".ts", ".tsx", ".mjs", ".json", ".md"];
const IGNORED_DIRS = ["node_modules", ".git", ".next", "dist", ".system_generated"];

function scanDirectory(dir: string, fileList: string[] = []): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (IGNORED_DIRS.includes(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      scanDirectory(fullPath, fileList);
    } else if (EXTENSIONS.some((ext) => entry.name.endsWith(ext))) {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

function checkEncoding() {
  const rootDir = process.cwd();
  const files = scanDirectory(rootDir);
  let failed = false;

  console.log(`Auditing UTF-8 encoding across ${files.length} project files...`);

  let bomCount = 0;
  for (const file of files) {
    const buffer = fs.readFileSync(file);

    // Verify valid UTF-8 string decoding
    try {
      const decoder = new TextDecoder("utf-8", { fatal: true });
      decoder.decode(buffer);
    } catch (err) {
      console.error(`[FAIL - Invalid UTF-8]: ${path.relative(rootDir, file)} is not valid UTF-8:`, err);
      failed = true;
    }

    // Check for UTF-8 BOM
    if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
      bomCount++;
    }
  }

  if (failed) {
    console.error("Encoding audit FAILED: Invalid UTF-8 detected.");
    process.exit(1);
  } else {
    console.log(`Encoding audit PASSED. All ${files.length} files are strictly valid UTF-8 (${bomCount} legacy files with UTF-8 BOM tolerated for hash immutability).`);
  }
}

checkEncoding();
