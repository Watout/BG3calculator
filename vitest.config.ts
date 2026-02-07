import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "apps/desktop-tauri/src/**/*.test.ts",
      "apps/desktop-tauri/src/**/*.test.tsx",
      "packages/dice-parser/src/**/*.test.ts",
      "packages/prob/src/**/*.test.ts",
      "packages/domain/src/**/*.test.ts",
      "packages/rulesets/src/**/*.test.ts"
    ],
    passWithNoTests: true
  }
});
