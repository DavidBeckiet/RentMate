import { describe, expect, it, vi } from "vitest";
import type { ApiTransport } from "./transport";
import { createUsersApi } from "./users";

function transport(): {
  readonly client: ApiTransport;
  readonly object: ReturnType<typeof vi.fn>;
} {
  const object = vi.fn();
  return {
    client: { raw: vi.fn(), object, page: vi.fn(), void: vi.fn() } as unknown as ApiTransport,
    object
  };
}

describe("createUsersApi tenant verification routes", () => {
  it("keeps tenant status and independent email/phone actions under the gateway namespace", () => {
    const mock = transport();
    const api = createUsersApi(mock.client);

    void api.getTenantContactVerificationStatus();
    void api.requestTenantEmailVerification();
    void api.confirmTenantEmailVerification("123456");
    void api.requestTenantPhoneVerification();
    void api.confirmTenantPhoneVerification("123456");

    expect(mock.object).toHaveBeenNthCalledWith(1, "/api/v1/tenant/verifications/status", { signal: undefined });
    expect(mock.object).toHaveBeenNthCalledWith(2, "/api/v1/tenant/verifications/email/request", {
      method: "POST",
      json: {},
      signal: undefined
    });
    expect(mock.object).toHaveBeenNthCalledWith(3, "/api/v1/tenant/verifications/email/confirm", {
      method: "POST",
      json: { code: "123456" },
      signal: undefined
    });
    expect(mock.object).toHaveBeenNthCalledWith(4, "/api/v1/tenant/verifications/phone/request", {
      method: "POST",
      json: {},
      signal: undefined
    });
    expect(mock.object).toHaveBeenNthCalledWith(5, "/api/v1/tenant/verifications/phone/confirm", {
      method: "POST",
      json: { code: "123456" },
      signal: undefined
    });
  });
});
