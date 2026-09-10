import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "zap-reports/**",
    "next-env.d.ts",
    "scripts/check_status*.js",
    "scripts/fix_*.js",
    "scripts/patch_*.js",
    "scripts/test_mocked.ts",
  ]),
]);
