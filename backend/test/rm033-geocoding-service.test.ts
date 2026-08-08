import { describe, expect, it, vi } from "vitest";
import { NominatimClientError, type NominatimClient } from "../src/integrations/nominatim.client.js";
import { createGeocodingService } from "../src/modules/listings/geocoding-service.js";

function client(result: readonly { displayName: string; latitude: number; longitude: number }[] = []): NominatimClient {
  return { forwardGeocode: vi.fn(async () => result) };
}

describe("RM-033 geocoding service", () => {
  it("calls the provider exactly once for a LANDLORD and projects safe candidates", async () => {
    const provider = client([
      { displayName: "Place", latitude: 10.772341, longitude: 106.697912 },
      { displayName: "Other", latitude: 10.8, longitude: 106.7 }
    ]);
    const service = createGeocodingService(provider);
    const result = await service.forwardGeocode({ userId: 7, role: "LANDLORD" }, { addressText: "101 Example Street" });

    expect(provider.forwardGeocode).toHaveBeenCalledOnce();
    expect(provider.forwardGeocode).toHaveBeenCalledWith("101 Example Street");
    expect(result).toStrictEqual([
      { displayName: "Place", latitude: 10.772341, longitude: 106.697912 },
      { displayName: "Other", latitude: 10.8, longitude: 106.7 }
    ]);
  });

  it("returns zero candidates without persistence dependencies", async () => {
    await expect(
      createGeocodingService(client()).forwardGeocode(
        { userId: 7, role: "LANDLORD" },
        { addressText: "Unknown address" }
      )
    ).resolves.toStrictEqual([]);
  });

  it.each(["TENANT", "ADMIN"] as const)("defensively rejects %s before provider work", async (role) => {
    const provider = client();
    await expect(
      createGeocodingService(provider).forwardGeocode({ userId: 7, role }, { addressText: "Address" })
    ).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    expect(provider.forwardGeocode).not.toHaveBeenCalled();
  });

  it("maps only the sanitized known provider failure to 502", async () => {
    const privateError = new NominatimClientError();
    Object.defineProperty(privateError, "privateDetail", { value: "sensitive address/provider response" });
    const provider: NominatimClient = { forwardGeocode: vi.fn(async () => Promise.reject(privateError)) };

    const operation = createGeocodingService(provider).forwardGeocode(
      { userId: 7, role: "LANDLORD" },
      { addressText: "Sensitive address" }
    );
    await expect(operation).rejects.toMatchObject({
      code: "PROVIDER_UNAVAILABLE",
      status: 502,
      message: "The geocoding provider is unavailable.",
      details: []
    });
  });

  it("does not misclassify unexpected programming errors", async () => {
    const failure = new TypeError("unexpected implementation failure");
    const provider: NominatimClient = { forwardGeocode: vi.fn(async () => Promise.reject(failure)) };
    await expect(
      createGeocodingService(provider).forwardGeocode({ userId: 7, role: "LANDLORD" }, { addressText: "Address" })
    ).rejects.toBe(failure);
  });
});
