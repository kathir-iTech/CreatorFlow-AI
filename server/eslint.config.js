import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

// Server (Node/Express) lint config — mirrors the root frontend config's
// spirit with Node globals. `no-console` is a warning (not error) because
// config/env.ts legitimately logs before pino exists; everywhere else a
// warning here means "use the structured logger".
export default tseslint.config(
  { ignores: ["dist", "node_modules"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["src/**/*.ts", "test/**/*.ts"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: globals.node,
    },
    rules: {
      "no-console": "warn",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
);
