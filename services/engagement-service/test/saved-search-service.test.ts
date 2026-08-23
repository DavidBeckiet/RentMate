import assert from "node:assert/strict";
import test from "node:test";
import type { SqlExecutor } from "../../shared/src/runtime/db/sql-executor.js";
import type { AuthenticatedPrincipal } from "../../shared/src/runtime/shared/types/authentication.js";
import type {
  SavedSearch,
  SavedSearchRepository
} from "../src/modules/saved-searches/repositories/saved-search-repository.js";
import { createSavedSearchService } from "../src/modules/saved-searches/services/saved-search-service.js";
import type { CreateSavedSearchInput } from "../src/modules/saved-searches/validations/saved-search-validation.js";

const tenant: AuthenticatedPrincipal = Object.freeze({ userId: 7, role: "TENANT" });
const otherTenant: AuthenticatedPrincipal = Object.freeze({ userId: 8, role: "TENANT" });
const landlord: AuthenticatedPrincipal = Object.freeze({ userId: 9, role: "LANDLORD" });
const query: CreateSavedSearchInput["query"] = Object.freeze({
  q: null,
  areaName: "Quận 3",
  minMonthlyRent: null,
  maxMonthlyRent: 7_000_000,
  minRoomAreaSqm: null,
  maxRoomAreaSqm: null,
  propertyType: null,
  amenities: Object.freeze(["WIFI"]),
  mode: "ordinary",
  north: null,
  south: null,
  east: null,
  west: null,
  centerLat: null,
  centerLng: null,
  radiusKm: null,
  sort: "newest"
});

function harness() {
  const rows = new Map<number, SavedSearch>();
  let nextId = 1;
  let updateCount = 0;
  const executor: SqlExecutor = {
    query: async () => {
      throw new Error("SQL is not used by this test.");
    }
  };
  const repository: SavedSearchRepository = {
    async create(_executor, tenantId, input) {
      const row = Object.freeze({
        id: nextId++,
        tenantId,
        name: input.name,
        isActive: input.isActive,
        query: input.query,
        createdAt: "2026-08-23T00:00:00.000Z",
        updatedAt: "2026-08-23T00:00:00.000Z"
      });
      rows.set(row.id, row);
      return row;
    },
    async list(_executor, tenantId, pageSize, offset) {
      return [...rows.values()].filter((row) => row.tenantId === tenantId).slice(offset, offset + pageSize + 1);
    },
    async findForUpdate(_executor, tenantId, id) {
      const row = rows.get(id);
      return row?.tenantId === tenantId ? row : null;
    },
    async update(_executor, tenantId, id, input) {
      updateCount += 1;
      const current = rows.get(id)!;
      const row = Object.freeze({
        ...current,
        tenantId,
        name: input.name,
        isActive: input.isActive,
        query: input.query,
        updatedAt: "2026-08-23T01:00:00.000Z"
      });
      rows.set(id, row);
      return row;
    },
    async remove(_executor, tenantId, id) {
      const row = rows.get(id);
      return row?.tenantId === tenantId ? rows.delete(id) : false;
    }
  };
  const service = createSavedSearchService({
    repository,
    transactionRunner: { run: (operation) => operation(executor) }
  });
  return {
    service,
    get updateCount() {
      return updateCount;
    }
  };
}

test("creates, lists, updates, and deletes only tenant-owned saved searches", async () => {
  const subject = harness();
  const created = await subject.service.create(tenant, { name: "Quận 3", isActive: true, query });
  assert.equal((await subject.service.list(tenant, { page: 1, pageSize: 15, offset: 0 })).data.length, 1);
  await assert.rejects(() => subject.service.update(otherTenant, created.id, { name: "Không được" }), /not found/i);
  const updated = await subject.service.update(tenant, created.id, { isActive: false });
  assert.equal(updated.isActive, false);
  await subject.service.remove(tenant, created.id);
  assert.equal((await subject.service.list(tenant, { page: 1, pageSize: 15, offset: 0 })).data.length, 0);
  assert.throws(() => subject.service.create(landlord, { name: null, isActive: true, query }), /permission/i);
});

test("preserves updatedAt and avoids a write for a normalized no-op patch", async () => {
  const subject = harness();
  const created = await subject.service.create(tenant, { name: "Quận 3", isActive: true, query });
  const unchanged = await subject.service.update(tenant, created.id, { name: "Quận 3", query });
  assert.equal(unchanged.updatedAt, created.updatedAt);
  assert.equal(subject.updateCount, 0);
});
