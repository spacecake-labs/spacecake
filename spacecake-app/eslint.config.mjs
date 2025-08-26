import js from "@eslint/js"
import importPlugin from "eslint-plugin-import"
import { defineConfig, globalIgnores } from "eslint/config"
import tseslint from "typescript-eslint"

export default defineConfig([
  js.configs.recommended,
  ...tseslint.configs.recommended,
  globalIgnores([".tanstack", ".vite", "tests/fixtures/**"]),
  {
    languageOptions: {
      parser: tseslint.parser,
      ecmaVersion: 2018,
      sourceType: "module",
      globals: {
        window: "readonly",
        document: "readonly",
        console: "readonly",
      },
    },
    linterOptions: {
      reportUnusedDisableDirectives: true,
    },
    plugins: {
      import: importPlugin,
    },
    rules: {
      // Add custom rules or overrides here
    },
    settings: {
      "import/resolver": {
        typescript: true,
      },
    },
  },
])
