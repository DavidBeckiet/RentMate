import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const config = [
  {
    ignores: [
      ".next/**",
      "out/**",
      "coverage/**",
      "playwright-report/**",
      "test-results/**",
      "blob-report/**",
      "node_modules/**",
      "next-env.d.ts"
    ]
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    rules: {
      // Existing components intentionally synchronize local UI state from external inputs in effects.
      "react-hooks/set-state-in-effect": "off"
    }
  }
];

export default config;
