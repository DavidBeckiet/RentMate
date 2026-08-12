import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"],
    include: [
      "app/**/*.test.{ts,tsx}",
      "components/**/*.test.{ts,tsx}",
      "features/**/*.test.{ts,tsx}",
      "lib/**/*.test.{ts,tsx}",
      "test/**/*.test.{ts,tsx}"
    ],
    exclude: ["node_modules/**", ".next/**", "out/**", "dist/**", "build/**", "coverage/**"],
    clearMocks: true,
    mockReset: true,
    restoreMocks: true,
    unstubGlobals: true
  }
});
