import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContextValue } from "../../lib/auth/auth-provider";
import type { AdminListingDetail as Detail, UserProfile } from "../../types/api";

const apiMocks = vi.hoisted(() => ({ getListing: vi.fn() }));
const useAuthMock = vi.hoisted(() => vi.fn<() => AuthContextValue>());
const navigation = vi.hoisted(() => ({ query: "" }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(navigation.query) }));
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
  propertyType: { code: "ROOM", label: "Room" },
  amenities: [
    { code: "AIR_CONDITIONING", label: "Air conditioning" },
    { code: "BALCONY", label: "Balcony" },
    { code: "WIFI", label: "Wi-Fi" }
  ],
  images: [],
  currentModerationReason: "Cần rà soát",
  landlord: { id: 2, role: "LANDLORD", email: "owner@example.com", phone: "+8490", isActive: false },
  openReportCount: 0,
  possibleDuplicate: false,
  createdAt: "2026-08-01T00:00:00Z",
  updatedAt: "2026-08-01T00:00:00Z"
};

describe("AdminListingDetail", () => {
  beforeEach(() => {
    apiMocks.getListing.mockReset();
    navigation.query = "";
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
    navigation.query = "returnStatus=HIDDEN&returnPage=3";
    apiMocks.getListing.mockResolvedValue(detail);
    render(<AdminListingDetail listingId="7" />);
    expect(await screen.findByText("Tin quản trị")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Quay lại hàng đợi kiểm duyệt" })).toHaveAttribute(
      "href",
      "/admin/listings?status=HIDDEN&page=3"
    );
    expect(screen.getByRole("region", { name: "Thông tin tin đăng" })).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "Quyết định" })).toBeInTheDocument();
    expect(screen.getByText("12 Đường Chính Xác")).toBeInTheDocument();
    expect(screen.getByText("Bản đồ 10.77123, 106.70123")).toBeInTheDocument();
    expect(screen.getByText("Cần rà soát")).toBeInTheDocument();
    expect(screen.getByText("owner@example.com")).toBeInTheDocument();
    expect(screen.getByText("Phòng trọ")).toBeInTheDocument();
    expect(screen.getByText("Điều hòa")).toBeInTheDocument();
    expect(screen.getByText("Ban công")).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/Air conditioning|Balcony|Room/);
    expect(document.body).not.toHaveTextContent(/kéo ghim|tải ảnh|xóa ảnh/i);
  });

  it("shows authoritative moderation signals only when they exist", async () => {
    apiMocks.getListing.mockResolvedValue({
      ...detail,
      status: "PENDING",
      currentModerationReason: null,
      openReportCount: 2,
      possibleDuplicate: true
    });
    render(<AdminListingDetail listingId="7" />);

    const context = await screen.findByLabelText("Ngữ cảnh kiểm duyệt");
    expect(context).toHaveTextContent("2 báo cáo đang mở");
    expect(context).toHaveTextContent("Có khả năng trùng tiêu đề");
    expect(context).not.toHaveTextContent(/gian lận|không an toàn|có lỗi/i);
  });

  it("does not reserve a moderation context panel without signals or a current reason", async () => {
    apiMocks.getListing.mockResolvedValue({
      ...detail,
      status: "PENDING",
      currentModerationReason: null,
      openReportCount: 0,
      possibleDuplicate: false
    });
    render(<AdminListingDetail listingId="7" />);

    await screen.findByText("Tin quản trị");
    expect(screen.queryByLabelText("Ngữ cảnh kiểm duyệt")).not.toBeInTheDocument();
  });

  it("shows one evidence image at a time with controls, counter and thumbnails", async () => {
    apiMocks.getListing.mockResolvedValue({
      ...detail,
      images: [
        {
          id: 1,
          url: "https://example.com/1.jpg",
          altText: "Ảnh thứ nhất",
          displayOrder: 1,
          format: "jpg",
          width: 1200,
          height: 800,
          byteSize: 100,
          createdAt: "2026-08-01T00:00:00Z"
        },
        {
          id: 2,
          url: "https://example.com/2.jpg",
          altText: "Ảnh thứ hai",
          displayOrder: 2,
          format: "jpg",
          width: 1200,
          height: 800,
          byteSize: 100,
          createdAt: "2026-08-01T00:00:00Z"
        },
        {
          id: 3,
          url: "https://example.com/3.jpg",
          altText: "Ảnh thứ ba",
          displayOrder: 3,
          format: "jpg",
          width: 1200,
          height: 800,
          byteSize: 100,
          createdAt: "2026-08-01T00:00:00Z"
        }
      ]
    });
    render(<AdminListingDetail listingId="7" />);

    expect(await screen.findByText("Ảnh thứ nhất")).toBeInTheDocument();
    expect(screen.getByText("1 / 3")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Chọn ảnh tin đăng" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Xem ảnh tiếp theo" }));
    expect(screen.getByText("Ảnh thứ hai")).toBeInTheDocument();
    expect(screen.getByText("2 / 3")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Xem ảnh 3" }));
    expect(screen.getByText("Ảnh thứ ba")).toBeInTheDocument();
    expect(screen.getByText("3 / 3")).toBeInTheDocument();
  });

  it("shows one coherent not-found state without attempting the history workspace", async () => {
    apiMocks.getListing.mockRejectedValue(
      new ApiError({ status: 404, code: "NOT_FOUND", message: "private", category: "backend" })
    );
    render(<AdminListingDetail listingId="7" />);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Không tìm thấy tin"));
    expect(screen.queryByText("Lịch sử tin 7")).not.toBeInTheDocument();
  });
});
