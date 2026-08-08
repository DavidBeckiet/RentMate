import type { QueryResult, QueryResultRow } from "pg";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { ParameterizedQuery, SqlExecutor } from "../src/db/sql-executor.js";
import type { CloudinaryClient } from "../src/integrations/cloudinary.client.js";
import { createSessionTokenService } from "../src/modules/auth/session-token.js";
import { createBackendApp } from "../src/server-composition.js";
import type { Logger } from "../src/shared/logging/logger.js";
import type { UserRole } from "../src/shared/types/authentication.js";

const origin = "http://localhost:3000";
const secret = "rm030-http-test-only-secret";
const seconds = 1_900_000_000;

function result<Row extends QueryResultRow>(rows: Row[] = [], rowCount = rows.length): QueryResult<Row> {
  return { command: "SELECT", rowCount, oid: 0, fields: [], rows };
}

class Executor implements SqlExecutor {
  readonly queries: ParameterizedQuery[] = [];
  accountRole: UserRole = "LANDLORD";
  accountActive = true;
  owned = true;
  status = "APPROVED";
  images = [
    { id: 31, cloudinary_public_id: "private/target", display_order: 1 },
    { id: 32, cloudinary_public_id: "private/other", display_order: 2 }
  ];

  async query<Row extends QueryResultRow>(query: ParameterizedQuery): Promise<QueryResult<Row>> {
    this.queries.push(query);
    if (query.text.includes("FROM users")) {
      return result([
        { id: Number(query.values[0]), role: this.accountRole, is_active: this.accountActive }
      ] as unknown as Row[]);
    }
    if (query.text.includes("FROM property_types") && query.text.includes("WHERE is_active = true")) {
      return result([] as Row[]);
    }
    if (query.text.includes("FOR UPDATE OF l")) {
      return this.owned ? result([{ id: 7, status: this.status }] as unknown as Row[]) : result([] as Row[]);
    }
    if (query.text.includes("SELECT id, cloudinary_public_id, display_order FROM listing_images")) {
      return result(this.images as unknown as Row[]);
    }
    if (query.text.includes("DELETE FROM listing_images")) {
      const imageId = Number(query.values[0]);
      const before = this.images.length;
      this.images = this.images.filter((image) => image.id !== imageId);
      return result([] as Row[], before === this.images.length ? 0 : 1);
    }
    if (query.text.includes("UPDATE listings SET status")) {
      this.status = String(query.values[0]);
      return result([] as Row[], 1);
    }
    throw new Error(`Unexpected RM-030 HTTP SQL: ${query.text}`);
  }
}

function provider(failRemoval = false): CloudinaryClient {
  return {
    uploadImage: vi.fn(async () => {
      throw new Error("Upload is outside RM-030 HTTP tests");
    }),
    removeImage: vi.fn(async () => {
      if (failRemoval) throw new Error("private provider failure");
    })
  };
}

async function makeApp(executor = new Executor(), cloudinaryClient = provider()) {
  const logger: Logger = {
    debug: () => undefined,
    info: () => undefined,
    warn: vi.fn(),
    error: vi.fn()
  };
  return {
    app: await createBackendApp({
      frontendOrigin: origin,
      logger,
      checkDatabaseConnection: async () => undefined,
      sqlExecutor: executor,
      jwtSecret: secret,
      bcryptCost: 4,
      cookieSecure: false,
      sessionTokenClock: () => seconds,
      authRateLimitClock: () => 0,
      transactionRunner: async (operation) => operation(executor),
      cloudinaryClient
    }),
    executor,
    cloudinaryClient,
    logger
  };
}

async function cookie(role: UserRole = "LANDLORD", issuedAt = seconds): Promise<string> {
  const token = await createSessionTokenService({ secret, nowSeconds: () => issuedAt }).sign({ userId: 9, role });
  return `rentmate_session=${token}`;
}

function deleteImage(
  app: Awaited<ReturnType<typeof makeApp>>["app"],
  auth: string,
  path = "/api/v1/landlord/listings/7/images/31"
) {
  return request(app).delete(path).set("Origin", origin).set("Cookie", auth);
}

function privateQueries(executor: Executor): ParameterizedQuery[] {
  return executor.queries.filter((query) => !query.text.includes("FROM users"));
}

describe("RM-030 listing image delete HTTP", () => {
  it("enforces Origin and authentication before private SQL", async () => {
    const fixture = await makeApp();
    const path = "/api/v1/landlord/listings/7/images/31";
    await request(fixture.app).delete(path).expect(403);
    await request(fixture.app).delete(path).set("Origin", "http://denied.test").expect(403);
    await request(fixture.app).delete(path).set("Origin", origin).expect(401);
    await request(fixture.app).delete(path).set("Origin", origin).set("Cookie", "rentmate_session=invalid").expect(401);
    await deleteImage(fixture.app, await cookie("LANDLORD", seconds - 10_000)).expect(401);
    expect(privateQueries(fixture.executor)).toHaveLength(0);
  });

  it("rejects inactive authentication and wrong roles before private SQL", async () => {
    for (const role of ["TENANT", "ADMIN"] as const) {
      const fixture = await makeApp();
      fixture.executor.accountRole = role;
      await deleteImage(fixture.app, await cookie(role)).expect(403);
      expect(privateQueries(fixture.executor)).toHaveLength(0);
    }
    const inactive = await makeApp();
    inactive.executor.accountActive = false;
    await deleteImage(inactive.app, await cookie()).expect(401);
    expect(privateQueries(inactive.executor)).toHaveLength(0);
  });

  it("validates listingId before imageId, then query and body", async () => {
    const fixture = await makeApp();
    const auth = await cookie();
    const listing = await deleteImage(fixture.app, auth, "/api/v1/landlord/listings/bad/images/bad").expect(422);
    expect(listing.body.error.details[0].field).toBe("listingId");
    const image = await deleteImage(fixture.app, auth, "/api/v1/landlord/listings/7/images/bad").expect(422);
    expect(image.body.error.details[0].field).toBe("imageId");
    await deleteImage(fixture.app, auth, "/api/v1/landlord/listings/7/images/31?extra=1").expect(422);
    await deleteImage(fixture.app, auth).send({}).expect(422);
    expect(privateQueries(fixture.executor)).toHaveLength(0);
  });

  it.each([null, [], "text", 1, true])("rejects parsed body value %j", async (body) => {
    const fixture = await makeApp();
    await deleteImage(fixture.app, await cookie())
      .set("Content-Type", "application/json")
      .send(JSON.stringify(body))
      .expect(422);
    expect(privateQueries(fixture.executor)).toHaveLength(0);
  });

  it("keeps malformed JSON on the global sanitized 400 contract", async () => {
    const fixture = await makeApp();
    const response = await deleteImage(fixture.app, await cookie())
      .set("Content-Type", "application/json")
      .send('{"broken"')
      .expect(400);
    expect(response.body.error.code).toBe("MALFORMED_REQUEST");
  });

  it("accepts leading-zero listing and image IDs", async () => {
    const fixture = await makeApp();
    await deleteImage(fixture.app, await cookie(), "/api/v1/landlord/listings/0007/images/00031").expect(204);
    expect(fixture.executor.queries.find((query) => query.text.includes("FOR UPDATE"))?.values).toStrictEqual([7, 9]);
    expect(
      fixture.executor.queries.find((query) => query.text.includes("DELETE FROM listing_images"))?.values
    ).toStrictEqual([31, 7]);
  });

  it.each([
    ["missing or foreign listing", false, [31, 32]],
    ["missing image", true, [32]],
    ["same-owner other-listing image", true, [32]],
    ["other-owner image", true, [32]]
  ] as const)("returns the same generic 404 for %s", async (_name, owned, ids) => {
    const fixture = await makeApp();
    fixture.executor.owned = owned;
    fixture.executor.images = ids.map((id, index) => ({
      id,
      cloudinary_public_id: `private/${id}`,
      display_order: index + 1
    }));
    const response = await deleteImage(fixture.app, await cookie()).expect(404);
    expect(response.body.error).toMatchObject({
      code: "RESOURCE_NOT_FOUND",
      message: "The requested resource was not found."
    });
    expect(fixture.cloudinaryClient.removeImage).not.toHaveBeenCalled();
    expect(JSON.stringify(response.body)).not.toMatch(/private|displayOrder|owner|APPROVED/i);
  });

  it("protects the last non-DRAFT image", async () => {
    const fixture = await makeApp();
    fixture.executor.images = [{ id: 31, cloudinary_public_id: "private/target", display_order: 1 }];
    const response = await deleteImage(fixture.app, await cookie()).expect(422);
    expect(response.body.error).toMatchObject({
      code: "LAST_IMAGE_REQUIRED",
      message: "A non-draft listing must retain at least one image."
    });
    expect(fixture.cloudinaryClient.removeImage).not.toHaveBeenCalled();
  });

  it("allows a DRAFT final-image deletion and returns exact empty 204 without a cookie", async () => {
    const fixture = await makeApp();
    fixture.executor.status = "DRAFT";
    fixture.executor.images = [{ id: 31, cloudinary_public_id: "private/target", display_order: 1 }];
    const response = await deleteImage(fixture.app, await cookie()).expect(204);
    expect(response.text).toBe("");
    expect(response.headers["set-cookie"]).toBeUndefined();
    expect(fixture.cloudinaryClient.removeImage).toHaveBeenCalledWith("private/target");
  });

  it("keeps committed success when provider cleanup fails", async () => {
    const fixture = await makeApp(new Executor(), provider(true));
    const response = await deleteImage(fixture.app, await cookie()).expect(204);
    expect(response.text).toBe("");
    expect(fixture.cloudinaryClient.removeImage).toHaveBeenCalledOnce();
    expect(fixture.logger.warn).toHaveBeenCalledOnce();
  });

  it("returns generic 404 on repeat and performs only one provider cleanup", async () => {
    const fixture = await makeApp();
    const auth = await cookie();
    await deleteImage(fixture.app, auth).expect(204);
    await deleteImage(fixture.app, auth).expect(404);
    expect(fixture.cloudinaryClient.removeImage).toHaveBeenCalledOnce();
  });

  it("keeps V1-19 present and V1-21 absent", async () => {
    const fixture = await makeApp();
    await request(fixture.app).post("/api/v1/landlord/listings/7/images").set("Origin", origin).expect(401);
    await request(fixture.app).put("/api/v1/landlord/listings/7/images/order").set("Origin", origin).expect(404);
  });
});
