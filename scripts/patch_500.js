const fs = require("fs");
let content = fs.readFileSync("src/lib/erp/fiscal/providers/focus-provider.ts", "utf8");

content = content.replace(
  /const data = await response\.json\(\)\.catch\(\(\) => \(\{\}\)\);/g,
  `if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get("Retry-After") || "0", 10);
        return {
          success: false, canonicalStatus: "error", isRetryableError: true, errorCode: "PROVIDER_RATE_LIMIT",
          backoffSeconds: retryAfter > 0 ? retryAfter + Math.floor(Math.random() * 5) : undefined,
          error: "Rate limit excedido."
        };
      }
      if (response.status >= 500) {
        return {
          success: false, canonicalStatus: "error", isRetryableError: true, errorCode: "FOCUS_SUBMISSION_OUTCOME_UNKNOWN", recoveryStrategy: "status_check_first",
          error: "Provider HTTP " + response.status + ". Resultado incerto."
        };
      }
      const data = await response.json().catch(() => ({}));`
);
fs.writeFileSync("src/lib/erp/fiscal/providers/focus-provider.ts", content, "utf8");
