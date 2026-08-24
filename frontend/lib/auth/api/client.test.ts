import { describe, expect, it } from "vitest";
import { createApiClient } from "./client";
import type { ApiTransport, TransportRequestOptions } from "./transport";

interface TransportCall {
  readonly mode: "raw" | "object" | "page" | "void";
  readonly path: string;
  readonly options?: TransportRequestOptions;
}

function recordingTransport() {
  const calls: TransportCall[] = [];
  const raw: ApiTransport["raw"] = async (path, options) => {
    calls.push({ mode: "raw", path, options: { ...options, method: options?.method ?? "GET" } });
    return undefined as never;
  };
  const object: ApiTransport["object"] = async (path, options) => {
    calls.push({ mode: "object", path, options: { ...options, method: options?.method ?? "GET" } });
    return undefined as never;
  };
  const page: ApiTransport["page"] = async (path, options) => {
    calls.push({ mode: "page", path, options: { ...options, method: options?.method ?? "GET" } });
    return undefined as never;
  };
  const voidRequest: ApiTransport["void"] = async (path, options) => {
    calls.push({ mode: "void", path, options: { ...options, method: options?.method ?? "GET" } });
  };

  return { calls, transport: { raw, object, page, void: voidRequest } satisfies ApiTransport };
}

describe("shared API client endpoint inventory", () => {
  it("maps health and all V1-01 through V1-31 endpoints to the shared transport", async () => {
    const { calls, transport } = recordingTransport();
    const client = createApiClient(transport);
    const image = new Blob(["image"], { type: "image/webp" });

    const inventory = [
      { run: () => client.health.check(), mode: "raw", method: "GET", path: "/api/health" },
      {
        run: () =>
          client.auth.registerTenant({
            displayName: "Nguyễn Văn An",
            email: "tenant@example.com",
            password: "password"
          }),
        mode: "object",
        method: "POST",
        path: "/api/v1/auth/register/tenant"
      },
      {
        run: () =>
          client.auth.registerLandlord({
            displayName: "Nguyễn Văn An",
            email: "owner@example.com",
            password: "password",
            phone: "+84901234567"
          }),
        mode: "object",
        method: "POST",
        path: "/api/v1/auth/register/landlord"
      },
      {
        run: () => client.auth.login({ email: "tenant@example.com", password: "password" }),
        mode: "object",
        method: "POST",
        path: "/api/v1/auth/login"
      },
      { run: () => client.auth.logout(), mode: "void", method: "POST", path: "/api/v1/auth/logout" },
      { run: () => client.users.getCurrent(), mode: "object", method: "GET", path: "/api/v1/users/me" },
      {
        run: () => client.users.updateCurrent({ phone: null }),
        mode: "object",
        method: "PATCH",
        path: "/api/v1/users/me"
      },
      {
        run: () => client.lookups.listPropertyTypes(),
        mode: "object",
        method: "GET",
        path: "/api/v1/lookups/property-types"
      },
      {
        run: () => client.lookups.listAmenities(),
        mode: "object",
        method: "GET",
        path: "/api/v1/lookups/amenities"
      },
      {
        run: () => client.listings.searchPublic({ amenities: ["WIFI"], page: 1 }),
        mode: "page",
        method: "GET",
        path: "/api/v1/listings"
      },
      {
        run: () => client.listings.getPublicDetail(42),
        mode: "object",
        method: "GET",
        path: "/api/v1/listings/42"
      },
      {
        run: () => client.listings.createDraft({ title: "Draft" }),
        mode: "object",
        method: "POST",
        path: "/api/v1/landlord/listings"
      },
      {
        run: () => client.listings.listOwned({ status: "DRAFT" }),
        mode: "page",
        method: "GET",
        path: "/api/v1/landlord/listings"
      },
      {
        run: () => client.listings.getOwned(42),
        mode: "object",
        method: "GET",
        path: "/api/v1/landlord/listings/42"
      },
      {
        run: () => client.listings.updateOwned(42, { title: "Updated" }),
        mode: "object",
        method: "PATCH",
        path: "/api/v1/landlord/listings/42"
      },
      {
        run: () => client.listings.deleteOwned(42),
        mode: "void",
        method: "DELETE",
        path: "/api/v1/landlord/listings/42"
      },
      {
        run: () => client.listings.submit(42),
        mode: "object",
        method: "POST",
        path: "/api/v1/landlord/listings/42/submit"
      },
      {
        run: () => client.listings.deactivate(42),
        mode: "object",
        method: "POST",
        path: "/api/v1/landlord/listings/42/deactivate"
      },
      {
        run: () => client.listings.reactivate(42),
        mode: "object",
        method: "POST",
        path: "/api/v1/landlord/listings/42/reactivate"
      },
      {
        run: () => client.listings.uploadImage(42, { image, altText: "Room" }),
        mode: "object",
        method: "POST",
        path: "/api/v1/landlord/listings/42/images"
      },
      {
        run: () => client.listings.deleteImage(42, 91),
        mode: "void",
        method: "DELETE",
        path: "/api/v1/landlord/listings/42/images/91"
      },
      {
        run: () => client.listings.reorderImages(42, { imageIds: [91, 92] }),
        mode: "object",
        method: "PUT",
        path: "/api/v1/landlord/listings/42/images/order"
      },
      {
        run: () => client.listings.forwardGeocode({ addressText: "District 1" }),
        mode: "object",
        method: "POST",
        path: "/api/v1/geocoding/forward"
      },
      { run: () => client.favorites.list({ page: 2 }), mode: "page", method: "GET", path: "/api/v1/favorites" },
      { run: () => client.favorites.add(42), mode: "void", method: "PUT", path: "/api/v1/favorites/42" },
      {
        run: () => client.favorites.remove(42),
        mode: "void",
        method: "DELETE",
        path: "/api/v1/favorites/42"
      },
      {
        run: () => client.admin.listListings({ status: "PENDING" }),
        mode: "page",
        method: "GET",
        path: "/api/v1/admin/listings"
      },
      {
        run: () => client.admin.getListing(42),
        mode: "object",
        method: "GET",
        path: "/api/v1/admin/listings/42"
      },
      {
        run: () => client.admin.listHistory(42, { page: 2 }),
        mode: "page",
        method: "GET",
        path: "/api/v1/admin/listings/42/moderation-actions"
      },
      {
        run: () => client.admin.moderate(42, { action: "APPROVE" }),
        mode: "object",
        method: "POST",
        path: "/api/v1/admin/listings/42/moderation-actions"
      },
      {
        run: () => client.admin.listUsers({ role: "TENANT", isActive: false }),
        mode: "page",
        method: "GET",
        path: "/api/v1/admin/users"
      },
      {
        run: () => client.admin.setActivation(17, { isActive: false }),
        mode: "object",
        method: "PATCH",
        path: "/api/v1/admin/users/17/activation"
      }
    ] as const;

    for (const endpoint of inventory) await endpoint.run();

    expect(calls).toHaveLength(32);
    expect(calls.slice(1)).toHaveLength(31);
    inventory.forEach((endpoint, index) => {
      expect(calls[index]).toMatchObject({
        mode: endpoint.mode,
        path: endpoint.path,
        options: { method: endpoint.method }
      });
    });
  });

  it("preserves query/body inputs and creates the frozen upload multipart fields", async () => {
    const { calls, transport } = recordingTransport();
    const client = createApiClient(transport);
    const image = new Blob(["image"], { type: "image/png" });

    await client.listings.searchPublic({ propertyType: "STUDIO", amenities: ["WIFI"], centerLat: 10.77 });
    await client.admin.setActivation(17, { isActive: false });
    await client.listings.uploadImage(42, { image, altText: "Bright room" });

    expect(calls[0]?.options?.query).toEqual({ propertyType: "STUDIO", amenities: ["WIFI"], centerLat: 10.77 });
    expect(calls[1]?.options?.json).toEqual({ isActive: false });
    const formData = calls[2]?.options?.formData;
    const appendedImage = formData?.get("image");
    expect(appendedImage).toBeInstanceOf(Blob);
    expect((appendedImage as Blob).size).toBe(image.size);
    expect((appendedImage as Blob).type).toBe(image.type);
    expect(formData?.get("altText")).toBe("Bright room");
  });
});
