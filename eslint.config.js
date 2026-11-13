import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ["build/**", "node_modules/**"],
  },
  {
    rules: {
      // Allow TypeScript namespaces - they're useful for grouping related exports
      "@typescript-eslint/no-namespace": "off",
      // Allow empty destructuring patterns for unused parameters
      "no-empty-pattern": "off",
      // Allow explicit any - sometimes necessary for flexibility
      "@typescript-eslint/no-explicit-any": "off",
      // Allow unused vars with underscore prefix
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
      // Allow escape characters in regex that may be unnecessary
      "no-useless-escape": "off",
    },
  },
);
