import js from "@eslint/js";
import tseslint from "typescript-eslint";
export default tseslint.config(
  {
    ignores: [
      "dist",
      ".runtime",
      "node_modules",
      "test-results",
      "playwright-report",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
  {
    files: ["scripts/*.cjs"],
    languageOptions: {
      sourceType: "commonjs",
      globals: {
        require: "readonly",
        console: "readonly",
        process: "readonly",
        document: "readonly",
        innerWidth: "readonly",
        localStorage: "readonly",
        window: "readonly",
        Buffer: "readonly",
        performance: "readonly",
        requestAnimationFrame: "readonly",
      },
    },
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
);
