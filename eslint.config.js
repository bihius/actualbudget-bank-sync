import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import prettierPlugin from "eslint-plugin-prettier";

export default [
  js.configs.recommended,
  {
    languageOptions: {
      globals: {
        node: true,
        process: true,
        console: true,
        setTimeout: true,
        crypto: true,
        fetch: true,
        Math: true,
        parseInt: true,
        Date: true,
      },
      ecmaVersion: "latest",
      sourceType: "module",
    },
    plugins: {
      prettier: prettierPlugin,
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "no-console": "off", // Keep console for now until Pino is integrated
      "prettier/prettier": "error",
    },
  },
  prettier,
];
