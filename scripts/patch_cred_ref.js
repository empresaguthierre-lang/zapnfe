const fs = require("fs");
const files = [
  "src/lib/jobs/handlers/fiscal-invoice-submit.ts",
  "src/lib/jobs/handlers/fiscal-invoice-status-check.ts",
  "src/lib/jobs/handlers/fiscal-invoice-recover.ts"
];

for (const file of files) {
  let content = fs.readFileSync(file, "utf8");
  content = content.replace(
    /const credentials = await resolveSecret\(providerConfig\?\.credentials_reference\);/g,
    "const credentials = await resolveSecret(providerConfig?.credentials_reference || providerConfig?.credentials?.credentials_reference);"
  );
  fs.writeFileSync(file, content, "utf8");
}
