import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

const ignoreUnusedWithUnderscore = {
  "@typescript-eslint/no-unused-vars": [
    "error",
    {
      argsIgnorePattern: "^_",
      varsIgnorePattern: "^_",
      caughtErrorsIgnorePattern: "^_",
    },
  ],
};

export default tseslint.config(
  {
    ignores: ["dist", "dist-electron", "release", "node_modules"],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["src/renderer/**/*.{ts,tsx}", "src/shared/**/*.ts"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...ignoreUnusedWithUnderscore,
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
    },
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: [
      "electron/**/*.ts",
      "src/backend/**/*.ts",
      "src/workers/**/*.ts",
      "src/pipelines/**/*.ts",
      "vite.config.ts",
    ],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.node,
    },
    rules: {
      ...ignoreUnusedWithUnderscore,
    },
  },
);
