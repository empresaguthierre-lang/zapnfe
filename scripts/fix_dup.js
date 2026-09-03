const fs = require("fs");
let content = fs.readFileSync("src/lib/erp/fiscal/providers/focus-provider.ts", "utf8");

content = content.replace(/authorizedAt: data\.data_autorizacao,\r?\n\s*authorizedAt: data\.data_autorizacao,/g, "authorizedAt: data.data_autorizacao,");

fs.writeFileSync("src/lib/erp/fiscal/providers/focus-provider.ts", content, "utf8");
