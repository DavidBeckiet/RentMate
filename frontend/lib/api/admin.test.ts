import { describe, expect, it } from "vitest";
import { createAdminApi } from "./admin";
import type { ApiTransport } from "./transport";

function transportFixture() {
  const calls: Array<{ readonly method: "object" | "page"; readonly path: string; readonly options: unknown }> = [];
  const transport: ApiTransport = {
    raw: async () => undefined as never,
    object: async (path, options) => {
      calls.push({ method: "object", path, options });
      return undefined as never;
    },
    page: async (path, options) => {
      calls.push({ method: "page", path, options });
      return undefined as never;
    },
    void: async () => undefined
  };
  return { api: createAdminApi(transport), calls };
}

describe("admin users API", () => {
  it("maps each authoritative overview source without aggregating them", async () => {
    const { api, calls } = transportFixture();
    const signal = new AbortController().signal;

    await api.getIdentityOverview(signal);
    await api.getListingOverview(signal);
    await api.getEngagementOverview(signal);

    expect(calls).toEqual([
      { method: "object", path: "/api/v1/admin/overview/identity", options: { signal } },
      { method: "object", path: "/api/v1/admin/overview/listings", options: { signal } },
      { method: "object", path: "/api/v1/admin/overview/engagement", options: { signal } }
    ]);
  });

  it("passes directory search through the paginated users endpoint", async () => {
    const { api, calls } = transportFixture();

    await api.listUsers({ q: "minh@example.com", role: "TENANT", isActive: true, page: 2 });

    expect(calls).toEqual([
      {
        method: "page",
        path: "/api/v1/admin/users",
        options: {
          query: { q: "minh@example.com", role: "TENANT", isActive: true, page: 2 },
          signal: undefined
        }
      }
    ]);
  });

  it("maps account detail to the dedicated admin endpoint", async () => {
    const { api, calls } = transportFixture();
    const signal = new AbortController().signal;

    await api.getUser(42, signal);

    expect(calls).toEqual([{ method: "object", path: "/api/v1/admin/users/42", options: { signal } }]);
  });
});

describe("admin support requests API", () => {
  it("maps canonical support request retrieval to the dedicated admin endpoint", async () => {
    const { api, calls } = transportFixture();
    const signal = new AbortController().signal;

    await api.getSupportRequest(42, signal);

    expect(calls).toEqual([{ method: "object", path: "/api/v1/admin/support-requests/42", options: { signal } }]);
  });
});

describe("admin review moderation API", () => {
  it("maps the review queue query to the existing admin endpoint", async () => {
    const { api, calls } = transportFixture();

    await api.listReviews({ status: "PENDING", page: 4, pageSize: 40 });

    expect(calls).toEqual([
      {
        method: "page",
        path: "/api/v1/admin/reviews",
        options: { query: { status: "PENDING", page: 4, pageSize: 40 }, signal: undefined }
      }
    ]);
  });

  it("maps review detail and final status decisions without changing their paths", async () => {
    const { api, calls } = transportFixture();
    const signal = new AbortController().signal;

    await api.getReview(9, signal);
    await api.moderateReview(9, { status: "REJECTED", note: "Nội dung không phù hợp." }, signal);

    expect(calls).toEqual([
      { method: "object", path: "/api/v1/admin/reviews/9", options: { signal } },
      {
        method: "object",
        path: "/api/v1/admin/reviews/9/status",
        options: { method: "PATCH", json: { status: "REJECTED", note: "Nội dung không phù hợp." }, signal }
      }
    ]);
  });
});
