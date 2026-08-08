import type { QueryResult, QueryResultRow } from "pg";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { ParameterizedQuery, SqlExecutor } from "../src/db/sql-executor.js";
import { createSessionTokenService } from "../src/modules/auth/session-token.js";
import type { CloudinaryClient } from "../src/integrations/cloudinary.client.js";
import { createBackendApp } from "../src/server-composition.js";
import type { Logger } from "../src/shared/logging/logger.js";
import type { UserRole } from "../src/shared/types/authentication.js";

const origin = "http://localhost:3000";
const secret = "rm029-http-test-only-secret";
const seconds = 1_900_000_000;
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0x00]);

function result<Row extends QueryResultRow>(rows: Row[] = [], rowCount = rows.length): QueryResult<Row> {
  return { command: "SELECT", rowCount, oid: 0, fields: [], rows };
}

class Executor implements SqlExecutor {
  readonly queries: ParameterizedQuery[] = [];
  accountRole: UserRole = "LANDLORD";
  accountActive = true;
  owned = true;
  imageCount = 0;

  async query<Row extends QueryResultRow>(query: ParameterizedQuery): Promise<QueryResult<Row>> {
    this.queries.push(query);
    if (query.text.includes("FROM users")) {
      return result([{ id: 9, role: this.accountRole, is_active: this.accountActive }] as unknown as Row[]);
    }
    if (query.text.includes("FROM property_types") && query.text.includes("WHERE is_active = true")) {
      return result([] as Row[]);
    }
    if (query.text.includes("COUNT(*)::integer") && query.text.includes("listing_images")) {
      return this.owned ? result([{ id: 7, image_count: this.imageCount }] as unknown as Row[]) : result([] as Row[]);
    }
    if (query.text.includes("FOR UPDATE OF l")) {
      return this.owned ? result([{ id: 7, status: "APPROVED" }] as unknown as Row[]) : result([] as Row[]);
    }
    if (query.text.includes("SELECT id, display_order FROM listing_images")) return result([] as Row[]);
    if (query.text.includes("INSERT INTO listing_images")) {
      return result([
        {
          id: 31,
          secure_url: "https://provider.test/image.jpg",
          format: "jpg",
          width: 1200,
          height: 800,
          byte_size: 100_000,
          display_order: 1,
          alt_text: "Room",
          created_at: new Date("2026-08-08T00:00:00Z")
        }
      ] as unknown as Row[]);
    }
    if (query.text.includes("UPDATE listings SET status")) return result([] as Row[], 1);
    throw new Error(`Unexpected RM-029 HTTP SQL: ${query.text}`);
  }
}

const logger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined
};

function cloudinary(): CloudinaryClient {
  return {
    uploadImage: vi.fn(async () => ({
      publicId: "private/provider-id",
      secureUrl: "https://provider.test/image.jpg",
      format: "jpg" as const,
      width: 1200,
      height: 800,
      byteSize: 100_000
    })),
    removeImage: vi.fn(async () => undefined)
  };
}

async function makeApp(executor = new Executor(), provider = cloudinary()) {
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
      cloudinaryClient: provider
    }),
    executor,
    provider
  };
}

async function cookie(role: UserRole = "LANDLORD") {
  const token = await createSessionTokenService({ secret, nowSeconds: () => seconds }).sign({ userId: 9, role });
  return `rentmate_session=${token}`;
}

function listingQueries(executor: Executor) {
  return executor.queries.filter((query) => !query.text.includes("FROM users"));
}

function upload(
  application: Awaited<ReturnType<typeof makeApp>>["app"],
  auth: string,
  path = "/api/v1/landlord/listings/7/images"
) {
  return request(application)
    .post(path)
    .set("Origin", origin)
    .set("Cookie", auth)
    .field("altText", "  Room  ")
    .attach("image", jpeg, { filename: "room.jpg", contentType: "image/jpeg" });
}

describe("RM-029 listing image upload HTTP", () => {
  it("enforces Origin and authentication before listing SQL", async () => {
    const fixture = await makeApp();
    await request(fixture.app).post("/api/v1/landlord/listings/7/images").expect(403);
    await request(fixture.app)
      .post("/api/v1/landlord/listings/7/images")
      .set("Origin", "http://denied.test")
      .expect(403);
    await request(fixture.app).post("/api/v1/landlord/listings/7/images").set("Origin", origin).expect(401);
    await request(fixture.app)
      .post("/api/v1/landlord/listings/7/images")
      .set("Origin", origin)
      .set("Cookie", "rentmate_session=invalid")
      .expect(401);
    expect(listingQueries(fixture.executor)).toHaveLength(0);
  });

  it.each(["TENANT", "ADMIN"] as const)("rejects active %s before private listing SQL", async (role) => {
    const fixture = await makeApp();
    fixture.executor.accountRole = role;
    await upload(fixture.app, await cookie(role)).expect(403);
    expect(listingQueries(fixture.executor)).toHaveLength(0);
    expect(fixture.provider.uploadImage).not.toHaveBeenCalled();
  });

  it("rejects inactive authentication before listing SQL", async () => {
    const fixture = await makeApp();
    fixture.executor.accountActive = false;
    await upload(fixture.app, await cookie()).expect(401);
    expect(listingQueries(fixture.executor)).toHaveLength(0);
  });

  it("validates path, query, and multipart content type before preflight", async () => {
    const fixture = await makeApp();
    const auth = await cookie();
    await upload(fixture.app, auth, "/api/v1/landlord/listings/bad/images").expect(422);
    await upload(fixture.app, auth, "/api/v1/landlord/listings/7/images?extra=1").expect(422);
    await request(fixture.app)
      .post("/api/v1/landlord/listings/7/images")
      .set("Origin", origin)
      .set("Cookie", auth)
      .send({})
      .expect(400);
    expect(listingQueries(fixture.executor)).toHaveLength(0);
  });

  it("accepts a leading-zero listing ID", async () => {
    const fixture = await makeApp();
    await upload(fixture.app, await cookie(), "/api/v1/landlord/listings/0007/images").expect(201);
    expect(fixture.executor.queries.find((query) => query.text.includes("COUNT(*)"))?.values).toStrictEqual([7, 9]);
  });

  it("maps malformed, missing, duplicate, unknown, oversized, and invalid image requests", async () => {
    const auth = await cookie();
    const malformedFixture = await makeApp();
    await request(malformedFixture.app)
      .post("/api/v1/landlord/listings/7/images")
      .set("Origin", origin)
      .set("Cookie", auth)
      .set("Content-Type", "multipart/form-data; boundary=broken")
      .send("--broken\r\n")
      .expect(400);

    const missingFixture = await makeApp();
    await request(missingFixture.app)
      .post("/api/v1/landlord/listings/7/images")
      .set("Origin", origin)
      .set("Cookie", auth)
      .field("altText", "x")
      .expect(422);

    const duplicateFixture = await makeApp();
    await request(duplicateFixture.app)
      .post("/api/v1/landlord/listings/7/images")
      .set("Origin", origin)
      .set("Cookie", auth)
      .attach("image", jpeg, { filename: "a.jpg", contentType: "image/jpeg" })
      .attach("image", jpeg, { filename: "b.jpg", contentType: "image/jpeg" })
      .expect(422);

    const unknownFixture = await makeApp();
    await request(unknownFixture.app)
      .post("/api/v1/landlord/listings/7/images")
      .set("Origin", origin)
      .set("Cookie", auth)
      .field("unknown", "x")
      .attach("image", jpeg, { filename: "a.jpg", contentType: "image/jpeg" })
      .expect(422);

    const over = Buffer.alloc(5_242_881);
    jpeg.copy(over);
    const oversizedFixture = await makeApp();
    await request(oversizedFixture.app)
      .post("/api/v1/landlord/listings/7/images")
      .set("Origin", origin)
      .set("Cookie", auth)
      .attach("image", over, { filename: "a.jpg", contentType: "image/jpeg" })
      .expect(413);

    for (const [mimeType, bytes] of [
      ["image/png", jpeg],
      ["image/jpeg", Buffer.from("invalid")]
    ] as const) {
      const fixture = await makeApp();
      const response = await request(fixture.app)
        .post("/api/v1/landlord/listings/7/images")
        .set("Origin", origin)
        .set("Cookie", auth)
        .attach("image", bytes, { filename: "a.bin", contentType: mimeType })
        .expect(415);
      expect(response.body.error.code).toBe("UNSUPPORTED_IMAGE_TYPE");
    }
  });

  it.each([
    [false, 0, 404, "RESOURCE_NOT_FOUND"],
    [true, 8, 422, "IMAGE_LIMIT_EXCEEDED"]
  ] as const)("stops owner/count preflight failure before provider", async (owned, count, status, code) => {
    const fixture = await makeApp();
    fixture.executor.owned = owned;
    fixture.executor.imageCount = count;
    const response = await upload(fixture.app, await cookie()).expect(status);
    expect(response.body.error.code).toBe(code);
    expect(fixture.provider.uploadImage).not.toHaveBeenCalled();
  });

  it("maps provider failure to 502", async () => {
    const provider = cloudinary();
    vi.mocked(provider.uploadImage).mockRejectedValueOnce(new Error("raw provider detail"));
    const fixture = await makeApp(new Executor(), provider);
    const response = await upload(fixture.app, await cookie()).expect(502);
    expect(response.body.error).toMatchObject({
      code: "PROVIDER_UNAVAILABLE",
      message: "The image provider is unavailable."
    });
    expect(JSON.stringify(response.body)).not.toMatch(/raw provider/i);
  });

  it("returns exact OwnerImage envelope without provider ID or cookie", async () => {
    const fixture = await makeApp();
    const response = await upload(fixture.app, await cookie()).expect(201);
    expect(Object.keys(response.body.data).sort()).toStrictEqual(
      ["id", "url", "format", "width", "height", "byteSize", "displayOrder", "altText", "createdAt"].sort()
    );
    expect(response.body.data).toMatchObject({ id: 31, displayOrder: 1, altText: "Room" });
    expect(JSON.stringify(response.body)).not.toContain("private/provider-id");
    expect(response.headers["set-cookie"]).toBeUndefined();
    expect(fixture.provider.uploadImage).toHaveBeenCalledOnce();
  });

  it("preserves existing routes and omits V1-20 and V1-21", async () => {
    const fixture = await makeApp();
    await request(fixture.app).get("/api/v1/lookups/property-types").expect(200);
    await request(fixture.app).delete("/api/v1/landlord/listings/7/images/31").set("Origin", origin).expect(404);
    await request(fixture.app).put("/api/v1/landlord/listings/7/images/order").set("Origin", origin).expect(404);
  });
});
