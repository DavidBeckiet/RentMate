import { describe, expect, it, vi } from "vitest";
import { createTransport } from "./transport";

describe("API transport Gateway boundary", () => {
  it("uses the local Gateway by default and includes browser credentials", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ data: { id: 7 } }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );
    const transport = createTransport({ fetcher });

    await transport.object("/api/v1/users/me");

    expect(fetcher).toHaveBeenCalledWith(
      "http://localhost:4001/api/v1/users/me",
      expect.objectContaining({ method: "GET", credentials: "include" })
    );
  });

  it("preserves optional top-level page metadata without changing ordinary page envelopes", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          data: [{ id: 42 }],
          pagination: { page: 1, pageSize: 20, hasNextPage: false },
          metadata: { hasEverApprovedListing: true }
        })
      )
      .mockResolvedValueOnce(
        Response.json({ data: [{ id: 7 }], pagination: { page: 1, pageSize: 10, hasNextPage: false } })
      );
    const transport = createTransport({ fetcher });

    const ownerPage = await transport.page<{ id: number }, { hasEverApprovedListing: boolean }>(
      "/api/v1/landlord/listings"
    );
    const ordinaryPage = await transport.page<{ id: number }>("/api/v1/listings");

    expect(ownerPage.metadata).toEqual({ hasEverApprovedListing: true });
    expect(ordinaryPage).toEqual({
      data: [{ id: 7 }],
      pagination: { page: 1, pageSize: 10, hasNextPage: false }
    });
  });
});
