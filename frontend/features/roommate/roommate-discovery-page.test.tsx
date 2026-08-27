import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContextValue } from "../../lib/auth/auth-provider";
import { roommateRequest, tenantUser } from "./test-roommate-fixtures";

const apiMocks = vi.hoisted(() => ({ discover: vi.fn() }));
const useAuthMock = vi.hoisted(() => vi.fn<() => AuthContextValue>());

vi.mock("next/navigation", () => ({ usePathname: () => "/roommates" }));
vi.mock("../../lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("../../lib/api/client")>("../../lib/api/client");
  return { ...actual, api: { roommates: apiMocks } };
});
vi.mock("../../lib/auth/auth-provider", () => ({ useAuth: useAuthMock }));

import { RoommateDiscoveryPage } from "./roommate-discovery-page";

function auth(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  return { status: "authenticated", user: tenantUser, error: null, refresh: vi.fn(), logout: vi.fn(), ...overrides };
}

describe("RoommateDiscoveryPage", () => {
  beforeEach(() => {
    apiMocks.discover.mockReset();
    useAuthMock.mockReturnValue(auth());
    apiMocks.discover.mockResolvedValue({
      data: [roommateRequest()],
      pagination: { page: 1, pageSize: 12, hasNextPage: false }
    });
  });

  it("loads public-safe discovery cards and applies explicit filters", async () => {
    render(<RoommateDiscoveryPage />);
    expect(await screen.findByRole("heading", { name: "Bạn cùng phòng" })).toBeInTheDocument();
    expect(screen.queryByText("tenant@example.com")).not.toBeInTheDocument();
    expect(screen.queryByText(/106\.682|10\.782/)).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Khu vực"), { target: { value: "Quận 3" } });
    fireEvent.change(screen.getByLabelText("Bối cảnh listing"), { target: { value: "UNLINKED" } });
    fireEvent.click(screen.getByRole("button", { name: "Lọc yêu cầu" }));
    await waitFor(() =>
      expect(apiMocks.discover).toHaveBeenLastCalledWith(
        expect.objectContaining({ area: "Quận 3", listingMode: "UNLINKED" }),
        expect.any(AbortSignal)
      )
    );
  });

  it("clears submitted discovery filters explicitly", async () => {
    render(<RoommateDiscoveryPage />);
    await screen.findByRole("heading", { name: "Bạn cùng phòng" });

    fireEvent.change(screen.getByLabelText("Khu vực"), { target: { value: "Quận 3" } });
    fireEvent.click(screen.getByRole("button", { name: "Lọc yêu cầu" }));
    await waitFor(() =>
      expect(apiMocks.discover).toHaveBeenLastCalledWith(
        expect.objectContaining({ area: "Quận 3" }),
        expect.any(AbortSignal)
      )
    );

    fireEvent.click(screen.getByRole("button", { name: "Xóa bộ lọc" }));
    await waitFor(() =>
      expect(apiMocks.discover).toHaveBeenLastCalledWith(
        expect.not.objectContaining({ area: expect.anything() }),
        expect.any(AbortSignal)
      )
    );
  });
});
