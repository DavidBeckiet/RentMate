import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    exclude: ["test/database-connectivity.test.ts", "node_modules/**", "dist/**", "coverage/**"],
    clearMocks: true,
    mockReset: true,
    restoreMocks: true,
    unstubGlobals: true
  }
});
