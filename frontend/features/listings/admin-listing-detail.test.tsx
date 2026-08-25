import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContextValue } from "../../lib/auth/auth-provider";
import type { AdminListingDetail as Detail, UserProfile } from "../../types/api";

const apiMocks = vi.hoisted(() => ({ getListing: vi.fn() }));
const useAuthMock = vi.hoisted(() => vi.fn<() => AuthContextValue>());
vi.mock("../../lib/api/client", async () => ({
  ...(await vi.importActual<typeof import("../../lib/api/client")>("../../lib/api/client")),
  api: { admin: apiMocks }
}));
vi.mock("../../lib/auth/auth-provider", () => ({ useAuth: useAuthMock }));
vi.mock("next/image", () => ({ default: ({ alt }: { alt: string }) => <span>{alt}</span> }));
vi.mock("../../components/map/map-base", () => ({
  MapBase: ({ center }: { center: { latitude: number; longitude: number } }) => (
    <div>
      Bản đồ {center.latitude}, {center.longitude}
    </div>
  )
}));
vi.mock("./moderation-actions", () => ({ ModerationActions: () => <section>Hành động kiểm duyệt</section> }));
vi.mock("./moderation-history", () => ({
  ModerationHistory: ({ listingId }: { listingId: number }) => <section>Lịch sử tin {listingId}</section>
}));

import { ApiError } from "../../lib/api/client";
import { AdminListingDetail } from "./admin-listing-detail";

const admin: UserProfile = {
  id: 1,
  displayName: null,
  role: "ADMIN",
  email: "admin@example.com",
  phone: null,
  isActive: true,
  createdAt: "2026-08-01T00:00:00Z",
  updatedAt: "2026-08-01T00:00:00Z"
};
const auth = (overrides: Partial<AuthContextValue> = {}): AuthContextValue => ({
  status: "authenticated",
  user: admin,
  error: null,
  refresh: vi.fn().mockResolvedValue(undefined),
  logout: vi.fn(),
  ...overrides
});
const detail: Detail = {
  id: 7,
  status: "HIDDEN",
  businessStatus: "UNKNOWN",
  title: "Tin quản trị",
  description: "Mô tả",
  monthlyRent: 5000000,
  roomAreaSqm: 20,
  maxOccupants: null,
  addressText: "12 Đường Chính Xác",
  areaName: "Quận 1",
  latitude: 10.77123,
  longitude: 106.70123,
  availabilityStatus: "NOT_APPLICABLE",
  availabilityConfirmedAt: null,
  availabilityExpiresAt: null,
  propertyType: { code: "ROOM", label: "Phòng" },
  amenities: [{ code: "WIFI", label: "Wi-Fi" }],
  images: [],
  currentModerationReason: "Cần rà soát",
  landlord: { id: 2, role: "LANDLORD", email: "owner@example.com", phone: "+8490", isActive: false },
  createdAt: "2026-08-01T00:00:00Z",
  updatedAt: "2026-08-01T00:00:00Z"
};

describe("AdminListingDetail", () => {
  beforeEach(() => {
    apiMocks.getListing.mockReset();
    useAuthMock.mockReturnValue(auth());
  });

  it("gates invalid ids and non-admin roles without detail or history APIs", () => {
    const view = render(<AdminListingDetail listingId="oops" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Mã tin không hợp lệ");
    expect(apiMocks.getListing).not.toHaveBeenCalled();
    expect(screen.queryByText(/Lịch sử tin/)).not.toBeInTheDocument();
    useAuthMock.mockReturnValue(auth({ user: { ...admin, role: "TENANT" } }));
    view.rerender(<AdminListingDetail listingId="7" />);
    expect(screen.getByRole("alert")).toHaveTextContent("dành cho quản trị viên");
    expect(apiMocks.getListing).not.toHaveBeenCalled();
  });

  it("renders canonical private admin detail with read-only exact location", async () => {
    apiMocks.getListing.mockResolvedValue(detail);
    render(<AdminListingDetail listingId="7" />);
    expect(await screen.findByText("Tin quản trị")).toBeInTheDocument();
    expect(screen.getByText("12 Đường Chính Xác")).toBeInTheDocument();
    expect(screen.getByText("Bản đồ 10.77123, 106.70123")).toBeInTheDocument();
    expect(screen.getByText("Cần rà soát")).toBeInTheDocument();
    expect(screen.getByText("owner@example.com")).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/kéo ghim|tải ảnh|xóa ảnh/i);
  });

  it("keeps history independently available when detail returns 404", async () => {
    apiMocks.getListing.mockRejectedValue(
      new ApiError({ status: 404, code: "NOT_FOUND", message: "private", category: "backend" })
    );
    render(<AdminListingDetail listingId="7" />);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Không tìm thấy tin"));
    expect(screen.getByText("Lịch sử tin 7")).toBeInTheDocument();
  });
});
