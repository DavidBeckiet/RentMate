import assert from "node:assert/strict";
import test from "node:test";
import {
  createNominatimClient,
  NominatimClientError,
  type NominatimClient
} from "../../shared/src/runtime/integrations/nominatim.client.js";
import { ApplicationError } from "../../shared/src/runtime/shared/errors/application-error.js";
import { createGeocodingService } from "../src/modules/listings/services/geocoding-service.js";
import { validateReverseGeocodingInput } from "../src/modules/listings/validations/geocoding-validation.js";

test("Nominatim reverse geocoding sends an identified bounded request and normalizes Vietnamese area fields", async () => {
  let requestedUrl: URL | null = null;
  let requestedHeaders: Headers | null = null;
  const client = createNominatimClient({
    baseUrl: "https://nominatim.example.test",
    userAgent: "RentMate tests",
    fetchImpl: async (input, init) => {
      requestedUrl = new URL(String(input));
      requestedHeaders = new Headers(init?.headers);
      return Response.json({
        place_id: 123,
        display_name: "101 Nguyễn Huệ, Phường Bến Nghé, Quận 1, Thành phố Hồ Chí Minh, Việt Nam",
        lat: "10.776531",
        lon: "106.700982",
        address: {
          house_number: "101",
          road: "Nguyễn Huệ",
          suburb: "Phường Bến Nghé",
          city_district: "Quận 1",
          city: "Thành phố Hồ Chí Minh",
          country: "Việt Nam"
        }
      });
    }
  });

  assert.deepEqual(await client.reverseGeocode(10.776531, 106.700982), {
    addressText: "101 Nguyễn Huệ, Phường Bến Nghé, Quận 1, Thành phố Hồ Chí Minh, Việt Nam",
    areaName: "Phường Bến Nghé, Thành phố Hồ Chí Minh"
  });
  assert.equal(requestedUrl?.pathname, "/reverse");
  assert.equal(requestedUrl?.searchParams.get("lat"), "10.776531");
  assert.equal(requestedUrl?.searchParams.get("lon"), "106.700982");
  assert.equal(requestedUrl?.searchParams.get("format"), "jsonv2");
  assert.equal(requestedUrl?.searchParams.get("addressdetails"), "1");
  assert.equal(requestedUrl?.searchParams.get("layer"), "address");
  assert.equal(requestedUrl?.searchParams.get("accept-language"), "vi");
  assert.equal(requestedHeaders?.get("user-agent"), "RentMate tests");
});

test("Nominatim reverse geocoding treats an uncovered coordinate as no suggestion", async () => {
  const client = createNominatimClient({
    baseUrl: "https://nominatim.example.test",
    userAgent: "RentMate tests",
    fetchImpl: async () => Response.json({ error: "Unable to geocode" })
  });

  assert.equal(await client.reverseGeocode(0, 0), null);
});

test("reverse geocoding validates both coordinates before contacting the provider", () => {
  assert.deepEqual(validateReverseGeocodingInput({ latitude: 10.77, longitude: 106.7 }), {
    latitude: 10.77,
    longitude: 106.7
  });
  assert.throws(() => validateReverseGeocodingInput({ latitude: 91, longitude: 106.7 }));
  assert.throws(() => validateReverseGeocodingInput({ latitude: 10.77, longitude: 106.7, raw: true }));
});

test("reverse geocoding remains landlord-only and sanitizes provider failures", async () => {
  const unavailableClient: NominatimClient = {
    async forwardGeocode() {
      return [];
    },
    async reverseGeocode() {
      throw new NominatimClientError();
    }
  };
  const service = createGeocodingService(unavailableClient);

  await assert.rejects(
    () => service.reverseGeocode({ userId: 8, role: "TENANT" }, { latitude: 10.77, longitude: 106.7 }),
    (error: unknown) => error instanceof ApplicationError && error.code === "FORBIDDEN"
  );
  await assert.rejects(
    () => service.reverseGeocode({ userId: 7, role: "LANDLORD" }, { latitude: 10.77, longitude: 106.7 }),
    (error: unknown) => error instanceof ApplicationError && error.code === "PROVIDER_UNAVAILABLE"
  );
});
