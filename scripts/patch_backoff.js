const fs = require("fs");
const files = [
  "src/lib/jobs/handlers/fiscal-invoice-submit.ts",
  "src/lib/jobs/handlers/fiscal-invoice-status-check.ts",
  "src/lib/jobs/handlers/fiscal-invoice-recover.ts"
];

for (const file of files) {
  let content = fs.readFileSync(file, "utf8");
  // Replace: return { success: false, retryable: false, backoffMinutes: 2, error: ... }
  // With: return { success: false, retryable: false, error: ... }
  content = content.replace(/,\s*backoffMinutes:\s*\d+,(\s*error:)/g, (match, p1) => {
    // wait, we only want to remove it if retryable is false.
    return match; // fallback
  });
  
  // A better regex:
  // If we find `retryable: false, backoffMinutes: 2,` we replace with `retryable: false,`
  content = content.replace(/retryable:\s*false,\s*backoffMinutes:\s*\d+,/g, "retryable: false,");
  fs.writeFileSync(file, content, "utf8");
}
