import js from "@eslint/js";
import tseslint from "typescript-eslint";
import jsxA11y from "eslint-plugin-jsx-a11y";
import globals from "globals";

/**
 * Accessibility regression guard (ACCESSIBILITY-AUDIT.md §7.1).
 *
 * Scope is deliberately narrow: this exists to stop the audited findings from
 * reappearing, not to impose a general style regime on the codebase. Only the
 * jsx-a11y rules are errors. General JS/TS lint is intentionally NOT enabled —
 * turning it on across an existing codebase would bury the a11y signal in noise
 * and make the CI gate useless on day one.
 */
export default tseslint.config(
  {
    // Vendored shadcn/radix primitives; not our code to restyle.
    // NOTE: anything wired in from here is unguarded — re-audit on use.
    ignores: [
      "client/src/components/ui/**",
      "dist/**",
      "node_modules/**",
      "supabase/functions/**", // Deno runtime, different globals
    ],
  },
  {
    files: ["client/src/**/*.{ts,tsx}"],
    languageOptions: {
      globals: { ...globals.browser },
      parser: tseslint.parser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: { "jsx-a11y": jsxA11y },
    rules: {
      ...jsxA11y.configs.recommended.rules,

      // Errors, not warnings — each maps to a finding in ACCESSIBILITY-AUDIT.md.
      "jsx-a11y/label-has-associated-control": ["error", { assert: "either" }],
      "jsx-a11y/no-noninteractive-element-interactions": "error",
      "jsx-a11y/click-events-have-key-events": "error",
      "jsx-a11y/no-static-element-interactions": "error",
      "jsx-a11y/tabindex-no-positive": "error",
      "jsx-a11y/anchor-is-valid": "error",
      "jsx-a11y/aria-props": "error",
      "jsx-a11y/aria-role": "error",
      "jsx-a11y/role-has-required-aria-props": "error",
      "jsx-a11y/role-supports-aria-props": "error",
      "jsx-a11y/no-autofocus": "error",
      "jsx-a11y/heading-has-content": "error",
      "jsx-a11y/html-has-lang": "error",
      "jsx-a11y/img-redundant-alt": "error",
      "jsx-a11y/alt-text": "error",
    },
  }
);
