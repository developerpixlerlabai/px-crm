import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",

    // Not Next.js code. `google-app-script/` is Google Apps Script (a V8
    // sandbox with no module system at all) plus a dependency-free Node
    // harness that runs it under `node` with no build step. Its CommonJS
    // `require()` calls are the only way either half can work, so linting
    // them with the Next TypeScript rules reports 10 errors that have no
    // valid fix. The harness is covered by its own suite instead.
    "google-app-script/**",
  ]),
]);

export default eslintConfig;
