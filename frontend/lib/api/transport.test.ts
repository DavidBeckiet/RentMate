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
});
