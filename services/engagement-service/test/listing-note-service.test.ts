import assert from "node:assert/strict";
import test from "node:test";
import type { SqlExecutor } from "../../shared/src/runtime/db/sql-executor.js";
import type { AuthenticatedPrincipal } from "../../shared/src/runtime/shared/types/authentication.js";
import type { PublicListingSummary } from "../../shared/public-listing-summary.js";
import type {
  ListingNote,
  ListingNoteRepository
} from "../src/modules/listing-notes/repositories/listing-note-repository.js";
import { createListingNoteService } from "../src/modules/listing-notes/services/listing-note-service.js";

const tenant: AuthenticatedPrincipal = Object.freeze({ userId: 7, role: "TENANT" });
const otherTenant: AuthenticatedPrincipal = Object.freeze({ userId: 8, role: "TENANT" });
const landlord: AuthenticatedPrincipal = Object.freeze({ userId: 9, role: "LANDLORD" });
const listing: PublicListingSummary = Object.freeze({
  id: 42,
  title: "Studio sáng",
  monthlyRent: 7_500_000,
  roomAreaSqm: 28,
  areaName: "Quận 1",
  latitude: 10.772,
  longitude: 106.698,
  propertyType: Object.freeze({ code: "STUDIO", label: "Studio" }),
  amenities: Object.freeze([]),
  coverImage: Object.freeze({ url: "https://example.com/a.webp", altText: null, displayOrder: 1 }),
  updatedAt: "2026-08-24T00:00:00.000Z"
});

function harness() {
  const rows = new Map<string, ListingNote>();
  let writeCount = 0;
  const executor = {} as SqlExecutor;
  const key = (tenantId: number, listingId: number) => `${tenantId}:${listingId}`;
  const repository: ListingNoteRepository = {
    async list(_executor, tenantId, listingIds) {
      return listingIds.flatMap((listingId) => {
        const row = rows.get(key(tenantId, listingId));
        return row ? [row] : [];
      });
    },
    async findForUpdate(_executor, tenantId, listingId) {
      return rows.get(key(tenantId, listingId)) ?? null;
    },
    async upsert(_executor, tenantId, listingId, note) {
      writeCount += 1;
      const existing = rows.get(key(tenantId, listingId));
      const row = Object.freeze({
        tenantId,
        listingId,
        note,
        createdAt: existing?.createdAt ?? "2026-08-24T00:00:00.000Z",
        updatedAt: existing ? "2026-08-24T01:00:00.000Z" : "2026-08-24T00:00:00.000Z"
      });
      rows.set(key(tenantId, listingId), row);
      return row;
    },
    async remove(_executor, tenantId, listingId) {
      rows.delete(key(tenantId, listingId));
    }
  };
  const service = createListingNoteService({
    repository,
    transactionRunner: { run: (operation) => operation(executor) },
    loadPublicSummariesByIds: async (ids) => (ids.includes(listing.id) ? Object.freeze([listing]) : Object.freeze([]))
  });
  return {
    service,
    get writeCount() {
      return writeCount;
    }
  };
}

test("saves, lists and removes notes only within the current tenant", async () => {
  const subject = harness();
  const saved = await subject.service.save(tenant, 42, "Gần trường.");
  assert.equal(saved.note, "Gần trường.");
  assert.equal((await subject.service.list(tenant, [42])).length, 1);
  assert.equal((await subject.service.list(otherTenant, [42])).length, 0);
  await subject.service.remove(otherTenant, 42);
  assert.equal((await subject.service.list(tenant, [42])).length, 1);
  await subject.service.remove(tenant, 42);
  assert.equal((await subject.service.list(tenant, [42])).length, 0);
});

test("preserves timestamps for a no-op and rejects unavailable listings or another role", async () => {
  const subject = harness();
  const saved = await subject.service.save(tenant, 42, "Ưu tiên xem cuối tuần.");
  const unchanged = await subject.service.save(tenant, 42, "Ưu tiên xem cuối tuần.");
  assert.equal(unchanged.updatedAt, saved.updatedAt);
  assert.equal(subject.writeCount, 1);
  await assert.rejects(() => subject.service.save(tenant, 99, "Không công khai"), /not found/i);
  assert.throws(() => subject.service.list(landlord, [42]), /permission/i);
});
