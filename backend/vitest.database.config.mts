import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "test/database-connectivity.test.ts",
      "test/migrations.integration.test.ts",
      "test/rm005-schema.integration.test.ts",
      "test/rm006-schema.integration.test.ts"
    ],
    exclude: ["node_modules/**", "dist/**", "coverage/**"],
    clearMocks: true,
    restoreMocks: true,
    fileParallelism: false,
    testTimeout: 15_000
  }
});
