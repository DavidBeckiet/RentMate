import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    exclude: [
      "test/database-connectivity.test.ts",
      "test/migrations.integration.test.ts",
      "test/rm005-schema.integration.test.ts",
      "test/rm006-schema.integration.test.ts",
      "test/rm007-schema.integration.test.ts",
      "test/rm008-bootstrap.integration.test.ts",
      "test/rm009-database.integration.test.ts",
      "test/rm015-registration.database.integration.test.ts",
      "test/rm016-login.database.integration.test.ts",
      "test/rm017-users.database.integration.test.ts",
      "test/rm018-auth-users.database.integration.test.ts",
      "test/rm019-lookups.database.integration.test.ts",
      "test/rm020-listing-create.database.integration.test.ts",
      "test/rm021-owner-listing-read.database.integration.test.ts",
      "test/rm022-phase4.database.integration.test.ts",
      "test/rm023-listing-update.database.integration.test.ts",
      "test/rm024-current-moderation-reason.database.integration.test.ts",
      "test/rm025-listing-submit.database.integration.test.ts",
      "test/rm026-listing-lifecycle-actions.database.integration.test.ts",
      "test/rm027-listing-delete.database.integration.test.ts",
      "node_modules/**",
      "dist/**",
      "coverage/**"
    ],
    clearMocks: true,
    mockReset: true,
    restoreMocks: true,
    unstubGlobals: true
  }
});
