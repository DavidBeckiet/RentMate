import path from "node:path";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  createPhase4DatabaseFixture,
  phase4Origin,
  type Phase4DatabaseFixture
} from "./helpers/listings-phase4-fixture.js";

const migrations = path.resolve(process.cwd(), "migrations");
let fixture: Phase4DatabaseFixture;

async function insertDraft(landlordId: number, title: string | null = null): Promise<number> {
  const result = await fixture.pool.query<{ id: number }>({
    text: "INSERT INTO listings (landlord_id, status, title) VALUES ($1, 'DRAFT', $2) RETURNING id",
    values: [landlordId, title]
  });
  return result.rows[0]!.id;
}
async function row(id: number) {
  return (
    await fixture.pool.query({ text: "SELECT title, status, updated_at FROM listings WHERE id = $1", values: [id] })
  ).rows[0]!;
}
function patch(
  app: Awaited<ReturnType<Phase4DatabaseFixture["createApp"]>>["app"],
  token: string,
  id: number,
  body: object
) {
  return request(app)
    .patch(`/api/v1/landlord/listings/${id}`)
    .set("Origin", phase4Origin)
    .set("Cookie", `rentmate_session=${token}`)
    .send(body);
}

describe("RM-023 listing update PostgreSQL integration", () => {
  beforeAll(async () => {
    fixture = createPhase4DatabaseFixture(migrations);
    await fixture.rebuildSchema();
  });
  beforeEach(async () => fixture.resetData());
  afterAll(async () => {
    await fixture.dropSchema();
    await fixture.close();
  });

  it("keeps empty and normalized-equal requests as exact zero-write no-ops", async () => {
    const landlord = await fixture.insertUser("LANDLORD", 1);
    const id = await insertDraft(landlord, "Studio");
    const token = await fixture.signToken(landlord);
    const appFixture = await fixture.createApp();
    const before = await row(id);
    await patch(appFixture.app, token, id, {}).expect(200);
    await patch(appFixture.app, token, id, { title: " Studio " }).expect(200);
    const after = await row(id);
    expect(after).toStrictEqual(before);
    expect(
      appFixture.faultState.statements.filter((query) =>
        /^(?:\s*)(?:UPDATE listings|DELETE FROM listing_amenities|INSERT INTO listing_amenities)/i.test(query.text)
      )
    ).toHaveLength(0);
  });

  it("updates owner content once, advances updated_at, and hides non-ownership", async () => {
    const owner = await fixture.insertUser("LANDLORD", 2);
    const other = await fixture.insertUser("LANDLORD", 3);
    const id = await insertDraft(owner, "Old");
    const appFixture = await fixture.createApp();
    const before = await row(id);
    await new Promise((resolve) => setTimeout(resolve, 2));
    const response = await patch(appFixture.app, await fixture.signToken(owner), id, { title: "New" }).expect(200);
    expect(response.body.data).toMatchObject({ id, title: "New", status: "DRAFT" });
    const after = await row(id);
    expect(after.title).toBe("New");
    expect((after.updated_at as Date).getTime()).toBeGreaterThan((before.updated_at as Date).getTime());
    const missing = await patch(appFixture.app, await fixture.signToken(other), id, {}).expect(404);
    const absent = await patch(appFixture.app, await fixture.signToken(other), id + 9999, {}).expect(404);
    expect({ code: missing.body.error.code, message: missing.body.error.message }).toStrictEqual({
      code: absent.body.error.code,
      message: absent.body.error.message
    });
  });

  it("rolls back an injected conditional conflict and preserves the original row", async () => {
    const owner = await fixture.insertUser("LANDLORD", 4);
    const id = await insertDraft(owner, "Original");
    const before = await row(id);
    const appFixture = await fixture.createApp({ fault: "conditional-update" });
    await patch(appFixture.app, await fixture.signToken(owner), id, { title: "Attempted" }).expect(409);
    expect(await row(id)).toStrictEqual(before);
    expect(await fixture.tableCount("moderation_history")).toBe(0);
  });
});
