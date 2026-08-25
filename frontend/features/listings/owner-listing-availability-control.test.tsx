import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { OwnerListingDetail } from "../../types/api";

const apiMocks = vi.hoisted(() => ({ confirmAvailability: vi.fn() }));

vi.mock("../../lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("../../lib/api/client")>("../../lib/api/client");
  return { ...actual, api: { listings: apiMocks } };
});

import { OwnerListingAvailabilityControl } from "./owner-listing-availability-control";

const detail: OwnerListingDetail = {
  id: 42,
  status: "APPROVED",
  businessStatus: "AVAILABLE",
  title: "Studio",
  description: "Description",
  monthlyRent: 7_500_000,
  roomAreaSqm: 28,
  maxOccupants: 2,
  addressText: "Private address",
  areaName: "District 1",
  latitude: 10.77,
  longitude: 106.7,
  availabilityStatus: "REMINDER_DUE",
  availabilityConfirmedAt: "2026-07-01T00:00:00.000Z",
  availabilityExpiresAt: "2026-07-31T00:00:00.000Z",
  propertyType: null,
  amenities: [],
  images: [],
  currentModerationReason: null,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-02T00:00:00.000Z"
};

describe("OwnerListingAvailabilityControl", () => {
  it("confirms a stale listing and replaces the canonical detail", async () => {
    const updated = { ...detail, availabilityStatus: "CURRENT" as const, businessStatus: "AVAILABLE" as const };
    const onDetailChange = vi.fn();
    apiMocks.confirmAvailability.mockReset().mockResolvedValue(updated);

    render(<OwnerListingAvailabilityControl detail={detail} onDetailChange={onDetailChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Xác nhận còn phòng" }));

    await waitFor(() => expect(apiMocks.confirmAvailability).toHaveBeenCalledWith(42, expect.any(AbortSignal)));
    expect(onDetailChange).toHaveBeenCalledWith(updated);
  });

  it("does not render a confirmation action for a non-tracked listing", () => {
    render(
      <OwnerListingAvailabilityControl
        detail={{ ...detail, availabilityStatus: "NOT_APPLICABLE" }}
        onDetailChange={vi.fn()}
      />
    );
    expect(screen.queryByRole("button", { name: "Xác nhận còn phòng" })).not.toBeInTheDocument();
  });
});
