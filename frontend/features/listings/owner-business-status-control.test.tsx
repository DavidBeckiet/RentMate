import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContextValue } from "../../lib/auth/auth-provider";
import type { OwnerListingDetail } from "../../types/api";

const apiMocks = vi.hoisted(() => ({ updateBusinessStatus: vi.fn() }));
const useAuthMock = vi.hoisted(() => vi.fn<() => AuthContextValue>());

vi.mock("../../lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("../../lib/api/client")>("../../lib/api/client");
  return { ...actual, api: { listings: apiMocks } };
});
vi.mock("../../lib/auth/auth-provider", () => ({ useAuth: useAuthMock }));

import { OwnerBusinessStatusControl } from "./owner-business-status-control";

const detail: OwnerListingDetail = {
  id: 42,
  status: "APPROVED",
  businessStatus: "AVAILABLE",
  title: "Studio",
  description: "Description",
  monthlyRent: 7_500_000,
  roomAreaSqm: 28.5,
  maxOccupants: null,
  addressText: "Private address",
  areaName: "District 1",
  latitude: 10.77,
  longitude: 106.7,
  propertyType: null,
  amenities: [],
  images: [],
  currentModerationReason: null,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-02T00:00:00.000Z"
};

describe("OwnerBusinessStatusControl", () => {
  beforeEach(() => {
    apiMocks.updateBusinessStatus.mockReset();
    useAuthMock.mockReturnValue({
      status: "authenticated",
      user: null,
      error: null,
      refresh: vi.fn(),
      logout: vi.fn()
    });
  });

  it("updates the independent business status and replaces the canonical detail", async () => {
    const updated = { ...detail, businessStatus: "RENTED" as const };
    const onDetailChange = vi.fn();
    apiMocks.updateBusinessStatus.mockResolvedValue(updated);

    render(<OwnerBusinessStatusControl detail={detail} onDetailChange={onDetailChange} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "RENTED" } });
    fireEvent.click(screen.getByRole("button"));

    await waitFor(() =>
      expect(apiMocks.updateBusinessStatus).toHaveBeenCalledWith(
        42,
        { businessStatus: "RENTED" },
        expect.any(AbortSignal)
      )
    );
    expect(onDetailChange).toHaveBeenCalledWith(updated);
    expect(await screen.findByRole("status")).toBeInTheDocument();
  });
});
