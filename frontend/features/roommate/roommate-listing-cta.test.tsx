import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContextValue } from "../../lib/auth/auth-provider";
import { tenantUser, roommateProfile } from "./test-roommate-fixtures";

const apiMocks = vi.hoisted(() => ({ getProfile: vi.fn() }));
const useAuthMock = vi.hoisted(() => vi.fn<() => AuthContextValue>());
const routerMocks = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => routerMocks }));
vi.mock("../../lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("../../lib/api/client")>("../../lib/api/client");
  return { ...actual, api: { roommates: apiMocks } };
});
vi.mock("../../lib/auth/auth-provider", () => ({ useAuth: useAuthMock }));

import { ApiError } from "../../lib/api/client";
import { RoommateListingCta } from "./roommate-listing-cta";

function auth(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  return { status: "authenticated", user: tenantUser, error: null, refresh: vi.fn(), logout: vi.fn(), ...overrides };
}

describe("RoommateListingCta", () => {
  beforeEach(() => {
    apiMocks.getProfile.mockReset();
    routerMocks.push.mockReset();
    useAuthMock.mockReturnValue(auth());
  });

  it("only exposes the CTA for an eligible listing and directs a complete tenant to the linked-request flow", async () => {
    const hidden = render(<RoommateListingCta listingId={42} eligible={false} />);
    expect(hidden.queryByRole("button")).not.toBeInTheDocument();
    hidden.unmount();

    apiMocks.getProfile.mockResolvedValue(roommateProfile());
    render(<RoommateListingCta listingId={42} eligible />);
    expect(screen.getByText("Người thuê đang tìm một người để cân nhắc cùng thuê phòng này.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Tìm người ở ghép cho tin đăng này" }));
    await waitFor(() => expect(routerMocks.push).toHaveBeenCalledWith("/roommates/my-request?listingId=42"));
  });

  it("sends a tenant without an available profile to profile setup and keeps errors private", async () => {
    apiMocks.getProfile.mockRejectedValueOnce(
      new ApiError({ status: 404, code: "RESOURCE_NOT_FOUND", message: "private", category: "backend" })
    );
    render(<RoommateListingCta listingId={42} eligible />);
    fireEvent.click(screen.getByRole("button", { name: "Tìm người ở ghép cho tin đăng này" }));
    await waitFor(() =>
      expect(routerMocks.push).toHaveBeenCalledWith("/roommates/profile?next=/roommates/my-request?listingId=42")
    );

    apiMocks.getProfile.mockRejectedValueOnce(
      new ApiError({ status: 503, code: "DEPENDENCY_UNAVAILABLE", message: "private", category: "backend" })
    );
    fireEvent.click(screen.getByRole("button", { name: "Tìm người ở ghép cho tin đăng này" }));
    expect(await screen.findByRole("alert")).not.toHaveTextContent("private");
  });
});
