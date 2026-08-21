import { describe, expect, it, vi } from "vitest";
import { createTransport, serializeQuery } from "./transport";

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

describe("API transport", () => {
  it("normalizes the base URL and includes browser credentials", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ data: { id: 7 } }));
    const transport = createTransport({ baseUrl: "http://localhost:4000///", fetcher });

    await transport.object("/api/v1/users/me");

    expect(fetcher).toHaveBeenCalledWith(
      "http://localhost:4000/api/v1/users/me",
      expect.objectContaining({ method: "GET", credentials: "include" })
    );
  });

  it("serializes frozen query shapes without dropping false or numeric values", () => {
    expect(
      serializeQuery({
        q: "Bến Thành & chợ",
        page: 2,
        isActive: false,
        amenities: ["WIFI", "AIR_CONDITIONING"],
        omitted: undefined
      })
    ).toBe("?q=B%E1%BA%BFn+Th%C3%A0nh+%26+ch%E1%BB%A3&page=2&isActive=false&amenities=WIFI%2CAIR_CONDITIONING");
  });

  it("sends JSON with the correct header, body, and AbortSignal", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ data: { id: 9 } }));
    const transport = createTransport({ fetcher });
    const controller = new AbortController();
    const body = { phone: null };

    await transport.object("/api/v1/users/me", { method: "PATCH", json: body, signal: controller.signal });

    const init = fetcher.mock.calls[0]?.[1];
    expect(new Headers(init?.headers).get("Content-Type")).toBe("application/json");
    expect(init?.body).toBe(JSON.stringify(body));
    expect(init?.signal).toBe(controller.signal);
  });

  it("sends FormData without setting multipart Content-Type manually", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ data: { id: 4 } }, 201));
    const transport = createTransport({ fetcher });
    const formData = new FormData();
    formData.append("image", new Blob(["image"], { type: "image/webp" }));

    await transport.object("/api/v1/landlord/listings/3/images", { method: "POST", formData });

    const init = fetcher.mock.calls[0]?.[1];
    expect(init?.body).toBe(formData);
    expect(new Headers(init?.headers).has("Content-Type")).toBe(false);
  });

  it("unwraps object and paginated envelopes separately", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ data: { id: 12 } }))
      .mockResolvedValueOnce(
        jsonResponse({ data: [{ id: 12 }], pagination: { page: 1, pageSize: 20, hasNextPage: false } })
      );
    const transport = createTransport({ fetcher });

    await expect(transport.object<{ id: number }>("/object")).resolves.toEqual({ id: 12 });
    await expect(transport.page<{ id: number }>("/page")).resolves.toEqual({
      data: [{ id: 12 }],
      pagination: { page: 1, pageSize: 20, hasNextPage: false }
    });
  });

  it("does not parse JSON for a valid 204 response", async () => {
    const json = vi.fn();
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue({ ok: true, status: 204, json } as unknown as Response);
    const transport = createTransport({ fetcher });

    await expect(transport.void("/api/v1/auth/logout", { method: "POST" })).resolves.toBeUndefined();
    expect(json).not.toHaveBeenCalled();
  });

  it("normalizes safe backend error fields", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(
        {
          error: {
            code: "VALIDATION_FAILED",
            message: "The request contains invalid data.",
            requestId: "req_123",
            details: [{ field: "phone", code: "INVALID_VALUE", message: "phone is invalid." }]
          }
        },
        422
      )
    );
    const transport = createTransport({ fetcher });

    await expect(transport.object("/api/v1/users/me")).rejects.toMatchObject({
      name: "ApiError",
      status: 422,
      code: "VALIDATION_FAILED",
      requestId: "req_123",
      category: "backend",
      details: [{ field: "phone", code: "INVALID_VALUE", message: "phone is invalid." }]
    });
  });

  it("normalizes network failures without leaking the original error", async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error("socket credentials and private host"));
    const transport = createTransport({ fetcher });

    await expect(transport.object("/api/v1/users/me")).rejects.toEqual(
      expect.objectContaining({
        code: "NETWORK_ERROR",
        category: "network",
        status: null,
        requestId: null,
        details: []
      })
    );
  });

  it.each([
    ["malformed JSON", new Response("not-json", { status: 200 })],
    ["missing object data", jsonResponse({ result: { id: 1 } })],
    ["malformed page", jsonResponse({ data: [], pagination: { page: 1, pageSize: 20 } })]
  ])("reports UNEXPECTED_RESPONSE for %s", async (_label, response) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response);
    const transport = createTransport({ fetcher });
    const request = _label === "malformed page" ? transport.page("/page") : transport.object("/object");

    await expect(request).rejects.toMatchObject({ code: "UNEXPECTED_RESPONSE", category: "unexpected" });
  });
});
