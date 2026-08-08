import type { QueryResult, QueryResultRow } from "pg";
import request from "supertest";
import { describe, expect, it } from "vitest";
import type { ParameterizedQuery, SqlExecutor } from "../src/db/sql-executor.js";
import { createSessionTokenService } from "../src/modules/auth/session-token.js";
import { createBackendApp } from "../src/server-composition.js";
import type { Logger } from "../src/shared/logging/logger.js";
import type { UserRole } from "../src/shared/types/authentication.js";

const origin = "http://localhost:3000";
const secret = "rm031-http-test-only-secret";
const seconds = 1_900_000_000;

function result<Row extends QueryResultRow>(
  rows: Row[] = [],
  rowCount: number | null = rows.length,
  command = "SELECT"
): QueryResult<Row> {
  return { command, rowCount, oid: 0, fields: [], rows };
}

function row(id: number, displayOrder: number) {
  return {
    id,
    secure_url: `https://provider.test/${id}.jpg`,
    format: "jpg",
    width: 800,
    height: 600,
    byte_size: 1234,
    display_order: displayOrder,
    alt_text: null,
    created_at: new Date("2026-01-01T00:00:00Z")
  };
}

class Executor implements SqlExecutor {
  readonly queries: ParameterizedQuery[] = [];
  accountRole: UserRole = "LANDLORD";
  accountActive = true;
  owned = true;
  status = "APPROVED";
  images = [row(31, 1), row(32, 3), row(33, 5)];

  async query<Row extends QueryResultRow>(query: ParameterizedQuery): Promise<QueryResult<Row>> {
    this.queries.push(query);
    if (query.text.includes("FROM users")) {
      return result([
        { id: Number(query.values[0]), role: this.accountRole, is_active: this.accountActive }
      ] as unknown as Row[]);
    }
    if (query.text.includes("FOR UPDATE OF l")) {
      return this.owned ? result([{ id: 7, status: this.status }] as unknown as Row[]) : result([] as Row[]);
    }
    if (query.text.includes("FROM listing_images") && query.text.includes("secure_url")) {
      return result(this.images as unknown as Row[]);
    }
    if (query.text.startsWith("SET CONSTRAINTS")) return result([] as Row[], null, "SET");
    if (query.text.startsWith("WITH desired")) {
      const ids = query.values[1] as number[];
      this.images = ids.map((id, index) => row(id, index + 1));
      return result(this.images as unknown as Row[], ids.length, "UPDATE");
    }
    if (query.text.startsWith("UPDATE listings SET updated_at")) return result([] as Row[], 1, "UPDATE");
    throw new Error(`Unexpected RM-031 HTTP SQL: ${query.text}`);
  }
}

const logger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined
};

async function makeApp(executor = new Executor()) {
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
      transactionRunner: async (operation) => operation(executor)
    }),
    executor
  };
}

async function cookie(role: UserRole = "LANDLORD", issuedAt = seconds): Promise<string> {
  const token = await createSessionTokenService({ secret, nowSeconds: () => issuedAt }).sign({ userId: 9, role });
  return `rentmate_session=${token}`;
}

async function put(
  app: Awaited<ReturnType<typeof makeApp>>["app"],
  body: unknown,
  options: { readonly path?: string; readonly origin?: string; readonly cookie?: string } = {}
) {
  let operation = request(app)
    .put(options.path ?? "/api/v1/landlord/listings/7/images/order")
    .set("Origin", options.origin ?? origin)
    .set("Content-Type", "application/json");
  if (options.cookie !== "") operation = operation.set("Cookie", options.cookie ?? (await cookie()));
  return operation.send(body as string | object | undefined);
}

describe("RM-031 listing image-order HTTP integration", () => {
  it.each(["", "http://denied.test"])("rejects missing or denied Origin before private SQL", async (requestOrigin) => {
    const { app, executor } = await makeApp();
    const operation = request(app)
      .put("/api/v1/landlord/listings/7/images/order")
      .set("Content-Type", "application/json");
    if (requestOrigin) operation.set("Origin", requestOrigin);
    await operation
      .set("Cookie", await cookie())
      .send({ imageIds: [31, 32, 33] })
      .expect(403);
    expect(executor.queries).toHaveLength(0);
  });

  it("uses the existing sanitized malformed-JSON 400", async () => {
    const { app } = await makeApp();
    const response = await request(app)
      .put("/api/v1/landlord/listings/7/images/order")
      .set("Origin", origin)
      .set("Cookie", await cookie())
      .set("Content-Type", "application/json")
      .send('{"imageIds":[')
      .expect(400);
    expect(response.body.error.code).toBe("MALFORMED_REQUEST");
  });

  it.each([
    ["missing", ""],
    ["invalid", "rentmate_session=invalid"]
  ])("returns 401 for %s authentication", async (_name, session) => {
    const { app } = await makeApp();
    const response = await put(app, { imageIds: [] }, { cookie: session });
    expect(response.status).toBe(401);
  });

  it("returns 401 for inactive authentication", async () => {
    const fixture = await makeApp();
    fixture.executor.accountActive = false;
    expect((await put(fixture.app, { imageIds: [] })).status).toBe(401);
  });

  it.each(["TENANT", "ADMIN"] as const)("returns 403 for %s before listing SQL", async (role) => {
    const fixture = await makeApp();
    fixture.executor.accountRole = role;
    const response = await put(fixture.app, { imageIds: [] }, { cookie: await cookie(role) });
    expect(response.status).toBe(403);
    expect(fixture.executor.queries.some((query) => query.text.includes("FROM listings"))).toBe(false);
  });

  it.each([
    ["0", 422],
    ["2147483648", 422],
    ["007", 200]
  ])("validates listingId %s", async (listingId, expected) => {
    const fixture = await makeApp();
    if (expected === 200) fixture.executor.images = [];
    const response = await put(
      fixture.app,
      { imageIds: [] },
      {
        path: `/api/v1/landlord/listings/${listingId}/images/order`
      }
    );
    expect(response.status).toBe(expected);
  });

  it("rejects unknown query parameters", async () => {
    const { app } = await makeApp();
    expect((await put(app, { imageIds: [] }, { path: "/api/v1/landlord/listings/7/images/order?x=1" })).status).toBe(
      422
    );
  });

  it.each([
    {},
    { imageIds: [31, 31] },
    { imageIds: [1, 2, 3, 4, 5, 6, 7, 8, 9] },
    { imageIds: ["31"] },
    { imageIds: [], status: "DRAFT" }
  ])("maps invalid body %j to 422", async (body) => {
    const { app } = await makeApp();
    expect((await put(app, body)).status).toBe(422);
  });

  it("returns generic 404 for a missing or non-owned listing", async () => {
    const fixture = await makeApp();
    fixture.executor.owned = false;
    const response = await put(fixture.app, { imageIds: [] });
    expect(response.status).toBe(404);
    expect(response.body.error).toMatchObject({
      code: "RESOURCE_NOT_FOUND",
      message: "The requested resource was not found."
    });
  });

  it("returns 409 for a structurally valid stale set without writes", async () => {
    const fixture = await makeApp();
    const response = await put(fixture.app, { imageIds: [31, 32] });
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("CONCURRENT_MODIFICATION");
    expect(
      fixture.executor.queries.some(
        (query) =>
          query.text.startsWith("SET CONSTRAINTS") ||
          query.text.startsWith("WITH desired") ||
          query.text.startsWith("UPDATE listings")
      )
    ).toBe(false);
  });

  it("returns an empty owned listing no-op as 200 data []", async () => {
    const fixture = await makeApp();
    fixture.executor.images = [];
    const response = await put(fixture.app, { imageIds: [] });
    expect(response.status).toBe(200);
    expect(response.body).toStrictEqual({ data: [] });
  });

  it("preserves gapped display positions for a same-relative-order no-op", async () => {
    const fixture = await makeApp();
    const response = await put(fixture.app, { imageIds: [31, 32, 33] });
    expect(response.status).toBe(200);
    expect(response.body.data.map((image: { displayOrder: number }) => image.displayOrder)).toStrictEqual([1, 3, 5]);
    expect(
      fixture.executor.queries.some(
        (query) =>
          query.text.startsWith("SET CONSTRAINTS") ||
          query.text.startsWith("WITH desired") ||
          query.text.startsWith("UPDATE listings")
      )
    ).toBe(false);
  });

  it("returns exact safe OwnerImage keys in requested final order after one changed reorder", async () => {
    const fixture = await makeApp();
    const response = await put(fixture.app, { imageIds: [33, 31, 32] });
    expect(response.status).toBe(200);
    expect(
      response.body.data.map((image: { id: number; displayOrder: number }) => [image.id, image.displayOrder])
    ).toStrictEqual([
      [33, 1],
      [31, 2],
      [32, 3]
    ]);
    expect(Object.keys(response.body.data[0]).sort()).toStrictEqual(
      ["id", "url", "format", "width", "height", "byteSize", "displayOrder", "altText", "createdAt"].sort()
    );
    expect(JSON.stringify(response.body)).not.toMatch(/cloudinaryPublicId/i);
    expect(response.headers["set-cookie"]).toBeUndefined();
    expect(fixture.executor.queries.filter((query) => query.text.startsWith("WITH desired"))).toHaveLength(1);
  });
});
