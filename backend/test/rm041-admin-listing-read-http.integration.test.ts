import type { QueryResult, QueryResultRow } from "pg";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { ParameterizedQuery, SqlExecutor } from "../src/db/sql-executor.js";
import { createSessionTokenService } from "../src/modules/auth/session-token.js";
import { createBackendApp } from "../src/server-composition.js";
import type { Logger } from "../src/shared/logging/logger.js";
import type { AuthenticationAccount, UserRole } from "../src/shared/types/authentication.js";

const origin = "http://localhost:3000";
const secret = "rm041-http-test-only-secret-not-for-production";
const seconds = 1_900_000_000;
const timestamp = "2026-08-09T07:15:00.000Z";

function result<Row extends QueryResultRow>(rows: Row[]): QueryResult<Row> {
  return { command: "SELECT", rowCount: rows.length, oid: 0, fields: [], rows };
}

class Executor implements SqlExecutor {
  readonly queries: ParameterizedQuery[] = [];
  account: AuthenticationAccount | null = null;
  listingExists = true;
  detailExists = true;

  async query<Row extends QueryResultRow>(query: ParameterizedQuery): Promise<QueryResult<Row>> {
    this.queries.push(query);
    const sql = query.text.replace(/\s+/g, " ");
    if (/FROM users\s+WHERE id = \$1/.test(sql)) {
      return result(
        (this.account
          ? [{ id: this.account.id, role: this.account.role, is_active: this.account.isActive }]
          : []) as unknown as Row[]
      );
    }
    if (sql.includes("WHERE l.status = $1::listing_status")) {
      return result([
        {
          id: 42,
          status: query.values[0],
          title: query.values[0] === "DRAFT" ? null : "Studio",
          area_name: query.values[0] === "DRAFT" ? null : "District 1",
          landlord_id: 17,
          landlord_email: "owner@example.com",
          landlord_phone: "+84901234567",
          landlord_is_active: false,
          updated_at: timestamp
        }
      ] as unknown as Row[]);
    }
    if (sql.includes("property_type.code AS property_type_code")) {
      if (!this.detailExists) return result([] as Row[]);
      return result([
        {
          id: 42,
          status: "REJECTED",
          title: "Studio",
          description: "Description",
          monthly_rent: "7500000",
          room_area_sqm: "28.50",
          address_text: "PRIVATE_ADDRESS_SENTINEL",
          area_name: "District 1",
          latitude: 10.772341,
          longitude: 106.697912,
          created_at: timestamp,
          updated_at: timestamp,
          property_type_code: "STUDIO",
          property_type_label: "Studio",
          landlord_id: 17,
          landlord_role: "LANDLORD",
          landlord_email: "owner@example.com",
          landlord_phone: "+84901234567",
          landlord_is_active: false
        }
      ] as unknown as Row[]);
    }
    if (sql.includes("FROM listing_amenities")) return result([{ code: "WIFI", label: "Wi-Fi" }] as unknown as Row[]);
    if (sql.includes("FROM listing_images")) {
      return result([
        {
          id: 91,
          secure_url: "https://cdn.example.test/image.webp",
          format: "webp",
          width: 800,
          height: 600,
          byte_size: 1000,
          display_order: 1,
          alt_text: null,
          created_at: timestamp
        }
      ] as unknown as Row[]);
    }
    if (sql.includes("SELECT reason FROM moderation_history"))
      return result([{ reason: "Latest rejection" }] as unknown as Row[]);
    if (sql.trim().startsWith("SELECT id FROM listings"))
      return result((this.listingExists ? [{ id: 42 }] : []) as unknown as Row[]);
    if (sql.includes("FROM moderation_history") && sql.includes("previous_status")) {
      return result([
        {
          id: 301,
          listing_id: 42,
          admin_id: 3,
          previous_status: "PENDING",
          new_status: "REJECTED",
          reason: "Rejected",
          created_at: timestamp
        }
      ] as unknown as Row[]);
    }
    throw new Error("Unexpected RM-041 HTTP SQL.");
  }
}

function logger(): Logger {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

async function app(executor: Executor) {
  return createBackendApp({
    frontendOrigin: origin,
    logger: logger(),
    checkDatabaseConnection: async () => undefined,
    sqlExecutor: executor,
    jwtSecret: secret,
    bcryptCost: 4,
    cookieSecure: false,
    sessionTokenClock: () => seconds
  });
}

async function cookie(role: UserRole, userId = 3, issuedAt = seconds): Promise<string> {
  const token = await createSessionTokenService({ secret, nowSeconds: () => issuedAt }).sign({ userId, role });
  return `rentmate_session=${token}`;
}

describe("RM-041 admin listing read HTTP contract", () => {
  it("returns exact default-PENDING queue projection and accepts all six statuses", async () => {
    for (const status of ["DRAFT", "PENDING", "APPROVED", "REJECTED", "HIDDEN", "INACTIVE"] as const) {
      const executor = new Executor();
      executor.account = { id: 3, role: "ADMIN", isActive: true };
      const query = status === "PENDING" ? "" : `?status=${status.toLowerCase()}`;
      const response = await request(await app(executor))
        .get(`/api/v1/admin/listings${query}`)
        .set("Cookie", await cookie("ADMIN"))
        .expect(200);
      expect(response.body.data[0]).toStrictEqual({
        id: 42,
        status,
        title: status === "DRAFT" ? null : "Studio",
        areaName: status === "DRAFT" ? null : "District 1",
        landlord: { id: 17, email: "owner@example.com", phone: "+84901234567", isActive: false },
        updatedAt: timestamp
      });
      expect(response.body.pagination).toStrictEqual({ page: 1, pageSize: 20, hasNextPage: false });
      expect(executor.queries[1]?.values).toStrictEqual([status, 21, 0]);
    }
  });

  it("returns exact private admin detail and history without provider/password fields", async () => {
    const executor = new Executor();
    executor.account = { id: 3, role: "ADMIN", isActive: true };
    const application = await app(executor);
    const auth = await cookie("ADMIN");
    const detail = await request(application).get("/api/v1/admin/listings/42").set("Cookie", auth).expect(200);
    expect(detail.body.data).toMatchObject({
      id: 42,
      addressText: "PRIVATE_ADDRESS_SENTINEL",
      latitude: 10.772341,
      longitude: 106.697912,
      monthlyRent: 7_500_000,
      landlord: { id: 17, role: "LANDLORD", isActive: false },
      currentModerationReason: "Latest rejection"
    });
    expect(Object.keys(detail.body.data.images[0]).sort()).toStrictEqual(
      ["altText", "byteSize", "createdAt", "displayOrder", "format", "height", "id", "url", "width"].sort()
    );
    expect(JSON.stringify(detail.body)).not.toMatch(/cloudinary_public_id|password_hash|provider-sentinel/i);

    const history = await request(application)
      .get("/api/v1/admin/listings/42/moderation-actions")
      .set("Cookie", auth)
      .expect(200);
    expect(history.body).toStrictEqual({
      data: [
        {
          id: 301,
          listingId: 42,
          adminId: 3,
          previousStatus: "PENDING",
          newStatus: "REJECTED",
          reason: "Rejected",
          createdAt: timestamp
        }
      ],
      pagination: { page: 1, pageSize: 20, hasNextPage: false }
    });
  });

  it("requires active ADMIN on all three routes", async () => {
    const paths = [
      "/api/v1/admin/listings",
      "/api/v1/admin/listings/42",
      "/api/v1/admin/listings/42/moderation-actions"
    ];
    for (const path of paths) {
      await request(await app(new Executor()))
        .get(path)
        .expect(401);
      for (const role of ["TENANT", "LANDLORD"] as const) {
        const executor = new Executor();
        executor.account = { id: 7, role, isActive: true };
        await request(await app(executor))
          .get(path)
          .set("Cookie", await cookie(role, 7))
          .expect(403);
      }
      const inactive = new Executor();
      inactive.account = { id: 3, role: "ADMIN", isActive: false };
      await request(await app(inactive))
        .get(path)
        .set("Cookie", await cookie("ADMIN"))
        .expect(401);
      await request(await app(new Executor()))
        .get(path)
        .set("Cookie", "rentmate_session=invalid")
        .expect(401);
      await request(await app(new Executor()))
        .get(path)
        .set("Cookie", await cookie("ADMIN", 3, seconds - 7_201))
        .expect(401);
    }
  });

  it("allows authenticated GETs with missing or denied Origin", async () => {
    for (const path of [
      "/api/v1/admin/listings",
      "/api/v1/admin/listings/42",
      "/api/v1/admin/listings/42/moderation-actions"
    ]) {
      for (const denied of [false, true]) {
        const executor = new Executor();
        executor.account = { id: 3, role: "ADMIN", isActive: true };
        const call = request(await app(executor))
          .get(path)
          .set("Cookie", await cookie("ADMIN"));
        if (denied) call.set("Origin", "https://denied.example");
        await call.expect(200);
      }
    }
  });

  it("enforces path/query/body discipline and missing-resource semantics", async () => {
    const auth = await cookie("ADMIN");
    for (const path of [
      "/api/v1/admin/listings/0",
      "/api/v1/admin/listings/1.5",
      "/api/v1/admin/listings/2147483648"
    ]) {
      const executor = new Executor();
      executor.account = { id: 3, role: "ADMIN", isActive: true };
      await request(await app(executor))
        .get(path)
        .set("Cookie", auth)
        .expect(422);
    }
    for (const query of ["?status=ALL", "?status=PENDING&status=APPROVED", "?unknown=x", "?pageSize=101"]) {
      const executor = new Executor();
      executor.account = { id: 3, role: "ADMIN", isActive: true };
      await request(await app(executor))
        .get(`/api/v1/admin/listings${query}`)
        .set("Cookie", auth)
        .expect(422);
    }
    const body = new Executor();
    body.account = { id: 3, role: "ADMIN", isActive: true };
    await request(await app(body))
      .get("/api/v1/admin/listings/42")
      .set("Cookie", auth)
      .send({})
      .expect(422);

    const missingDetail = new Executor();
    missingDetail.account = { id: 3, role: "ADMIN", isActive: true };
    missingDetail.detailExists = false;
    await request(await app(missingDetail))
      .get("/api/v1/admin/listings/42")
      .set("Cookie", auth)
      .expect(404);
    const missingHistory = new Executor();
    missingHistory.account = { id: 3, role: "ADMIN", isActive: true };
    missingHistory.listingExists = false;
    await request(await app(missingHistory))
      .get("/api/v1/admin/listings/42/moderation-actions")
      .set("Cookie", auth)
      .expect(404);
  });

  it("maps malformed JSON globally before route logic", async () => {
    const response = await request(await app(new Executor()))
      .get("/api/v1/admin/listings")
      .set("Content-Type", "application/json")
      .send("{")
      .expect(400);
    expect(response.body.error.code).toBe("MALFORMED_REQUEST");
  });
});
