import assert from "node:assert/strict";
import test from "node:test";
import type { QueryResult } from "pg";
import { createSqlExecutor } from "../../shared/src/runtime/db/sql-executor.js";
import { createUsersRepository } from "../src/modules/users/repositories/users-repository.js";
import {
  mapRoommateTenantProjectionRow,
  parseRoommateTenantProjectionIds
} from "../src/modules/users/roommate-tenant-projection.js";
import { mapRoommateRiskProjectionRow } from "../src/modules/users/roommate-risk-projection.js";

test("Identity roommate projection batch parser bounds, validates, and deduplicates IDs", () => {
  assert.deepEqual(parseRoommateTenantProjectionIds("7,7,42"), [7, 42]);
  assert.equal(parseRoommateTenantProjectionIds(undefined), null);
  assert.equal(parseRoommateTenantProjectionIds(""), null);
  assert.equal(parseRoommateTenantProjectionIds("0"), null);
  assert.equal(parseRoommateTenantProjectionIds("7,nope"), null);
  assert.equal(
    parseRoommateTenantProjectionIds(Array.from({ length: 101 }, (_, index) => String(index + 1)).join(",")),
    null
  );
});

test("Identity roommate projection preserves active state and supported account roles", () => {
  for (const [role, isActive] of [
    ["TENANT", true],
    ["LANDLORD", true],
    ["ADMIN", false]
  ] as const) {
    assert.deepEqual(
      mapRoommateTenantProjectionRow({
        id: role === "TENANT" ? 7 : role === "LANDLORD" ? 8 : 9,
        role,
        display_name: null,
        is_active: isActive,
        created_at: "2025-11-02T00:00:00.000Z",
        email_verified: role === "TENANT",
        phone_verified: false
      }),
      {
        tenantId: role === "TENANT" ? 7 : role === "LANDLORD" ? 8 : 9,
        role,
        displayName: null,
        isActive,
        memberSince: "2025-11",
        emailVerified: role === "TENANT",
        phoneVerified: false
      }
    );
  }
});

test("Identity repository roommate projection selects only public-safe fields", async () => {
  let capturedQuery: { readonly text: string; readonly values: readonly unknown[] } | null = null;
  const pool = {
    async query<Row>() {
      return {
        command: "SELECT",
        rowCount: 1,
        oid: 0,
        fields: [],
        rows: [
          {
            id: 7,
            role: "TENANT",
            display_name: "Minh Anh",
            is_active: true,
            created_at: new Date("2025-11-02T00:00:00.000Z"),
            email_verified: true,
            phone_verified: false
          }
        ] as Row[]
      } as unknown as QueryResult<Row>;
    }
  };
  const executor = {
    query: async <Row extends object>(query: { readonly text: string; readonly values: readonly unknown[] }) => {
      capturedQuery = query;
      return pool.query<Row>();
    }
  };

  const repository = createUsersRepository(createSqlExecutor(executor));
  assert.deepEqual(await repository.findRoommateTenantProjectionsByIds([7]), [
    {
      tenantId: 7,
      role: "TENANT",
      displayName: "Minh Anh",
      isActive: true,
      memberSince: "2025-11",
      emailVerified: true,
      phoneVerified: false
    }
  ]);
  assert.ok(capturedQuery);
  assert.deepEqual(capturedQuery.values, [[7]]);
  assert.match(capturedQuery.text, /display_name/iu);
  assert.match(capturedQuery.text, /email_verified_at IS NOT NULL AS email_verified/iu);
  assert.match(capturedQuery.text, /phone_verified_at IS NOT NULL AS phone_verified/iu);
  assert.doesNotMatch(capturedQuery.text, /\bemail\s*,|\bphone_e164\b|password/iu);
});

test("Identity risk projection exposes only exact account creation time", async () => {
  assert.deepEqual(mapRoommateRiskProjectionRow({ id: 7, created_at: new Date("2025-11-02T00:00:00.000Z") }), {
    tenantId: 7,
    createdAt: "2025-11-02T00:00:00.000Z"
  });

  let capturedQuery: { readonly text: string; readonly values: readonly unknown[] } | null = null;
  const executor = {
    query: async <Row extends object>(query: { readonly text: string; readonly values: readonly unknown[] }) => {
      capturedQuery = query;
      return {
        rows: [{ id: 7, created_at: new Date("2025-11-02T00:00:00.000Z") }] as Row[],
        rowCount: 1
      } as never;
    }
  };
  const repository = createUsersRepository(createSqlExecutor(executor));
  assert.deepEqual(await repository.findRoommateRiskProjectionsByIds([7]), [
    { tenantId: 7, createdAt: "2025-11-02T00:00:00.000Z" }
  ]);
  assert.ok(capturedQuery);
  assert.deepEqual(capturedQuery.values, [[7]]);
  assert.match(capturedQuery.text, /created_at/iu);
  assert.doesNotMatch(capturedQuery.text, /email|phone|password|display_name/iu);
});
