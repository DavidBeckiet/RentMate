import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/database-connectivity.test.ts"],
    exclude: ["node_modules/**", "dist/**", "coverage/**"],
    clearMocks: true,
    restoreMocks: true
  }
});
