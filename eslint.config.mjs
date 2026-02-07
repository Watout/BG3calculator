import js from "@eslint/js";
import parser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import globals from "globals";

const sourceFiles = ["**/*.ts", "**/*.tsx"];

export default [
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/coverage/**",
      "**/src-tauri/target/**",
      "**/vite.config.d.ts",
      "**/vite.config.js"
    ]
  },
  js.configs.recommended,
  {
    files: sourceFiles,
    languageOptions: {
      parser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: {
          jsx: true
        }
      },
      globals: {
        ...globals.browser,
        ...globals.node
      }
    },
    plugins: {
      "@typescript-eslint": tsPlugin
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      "@typescript-eslint/explicit-module-boundary-types": "error"
    }
  },
  {
    files: ["packages/domain/src/**/*.{ts,tsx}", "packages/prob/src/**/*.{ts,tsx}", "packages/dice-parser/src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            "@bg3dc/rulesets",
            "../../rulesets/*",
            "../rulesets/*",
            "packages/rulesets/*",
            "@bg3dc/desktop-tauri",
            "../../apps/*",
            "../apps/*",
            "apps/*"
          ]
        }
      ]
    }
  },
  {
    files: ["packages/rulesets/src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: ["@bg3dc/desktop-tauri", "../../apps/*", "../apps/*", "apps/*"]
        }
      ]
    }
  },
  {
    files: [
      "packages/domain/src/**",
      "packages/prob/src/**",
      "packages/dice-parser/src/**"
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: ["react", "react-dom", "@tauri-apps/*", "node:fs", "fs"]
        }
      ]
    }
  }
];
