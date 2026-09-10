const fs = require("fs");
let content = fs.readFileSync("src/lib/jobs/handlers/fiscal-invoice-submit.ts", "utf8");

content = content.replace(
  /return \{ success: false, retryable: result\.isRetryableError \?\? false, error: `\[\$\{result\.errorCode\}\] \$\{result\.error\}` \};/g,
  `return { success: false, retryable: result.isRetryableError ?? false, backoffSeconds: (result as any).backoffSeconds, error: \`[\${result.errorCode}] \${result.error}\` };`
);
fs.writeFileSync("src/lib/jobs/handlers/fiscal-invoice-submit.ts", content, "utf8");
