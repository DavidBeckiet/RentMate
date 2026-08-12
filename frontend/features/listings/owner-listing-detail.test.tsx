import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContextValue } from "../../lib/auth/auth-provider";
import type { OwnerListingDetail as OwnerDetail, UserProfile } from "../../types/api";

const apiMocks = vi.hoisted(() => ({
  getOwned: vi.fn(),
  updateOwned: vi.fn(),
  listPropertyTypes: vi.fn(),
  listAmenities: vi.fn()
}));
const useAuthMock = vi.hoisted(() => vi.fn<() => AuthContextValue>());

vi.mock("../../lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("../../lib/api/client")>("../../lib/api/client");
  return {
    ...actual,
    api: {
      listings: { getOwned: apiMocks.getOwned, updateOwned: apiMocks.updateOwned },
      lookups: { listPropertyTypes: apiMocks.listPropertyTypes, listAmenities: apiMocks.listAmenities }
    }
  };
});
vi.mock("../../lib/auth/auth-provider", () => ({ useAuth: useAuthMock }));
vi.mock("next/image", () => ({ default: ({ alt }: { alt: string }) => <span role="img" aria-label={alt} /> }));
vi.mock("../../components/map/map-base", () => ({
  MapBase: ({ ariaLabel, markers }: { ariaLabel: string; markers: readonly { label: string }[] }) => (
    <div role="region" aria-label={ariaLabel}>
      {markers.map((marker) => (
        <span key={marker.label}>{marker.label}</span>
      ))}
    </div>
  )
}));
vi.mock("./owner-lifecycle-actions", () => ({
  OwnerLifecycleActions: ({ detail, blocked }: { detail: OwnerDetail; blocked: boolean }) => (
    <div data-testid="lifecycle">
      {detail.status}:{String(blocked)}
    </div>
  )
}));

import { ApiError } from "../../lib/api/client";
import { OwnerListingDetail } from "./owner-listing-detail";

const refresh = vi.fn<() => Promise<void>>();
const landlord: UserProfile = {
  id: 7,
  role: "LANDLORD",
  email: "owner@example.com",
  phone: "+84901234567",
  isActive: true,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z"
};

function authValue(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  return { status: "authenticated", user: landlord, error: null, refresh, logout: vi.fn(), ...overrides };
}

function detail(overrides: Partial<OwnerDetail> = {}): OwnerDetail {
  return {
    id: 42,
    status: "APPROVED",
    title: "Studio chính chủ",
    description: "Mô tả chính xác",
    monthlyRent: 7_500_000,
    roomAreaSqm: 28.5,
    addressText: "101 Nguyễn Huệ, Quận 1",
    areaName: "Quận 1",
    latitude: 10.7731,
    longitude: 106.7032,
    propertyType: { code: "OLD_STUDIO", label: "Studio cũ" },
    amenities: [{ code: "OLD_WIFI", label: "Wi-Fi cũ" }],
    images: [
      {
        id: 2,
        url: "https://example.com/second.webp",
        altText: "Ảnh thứ hai",
        displayOrder: 2,
        format: "webp",
        width: 800,
        height: 600,
        byteSize: 123_456,
        createdAt: "2026-08-01T00:00:00.000Z"
      },
      {
        id: 1,
        url: "https://example.com/first.webp",
        altText: "Ảnh thứ nhất",
        displayOrder: 1,
        format: "webp",
        width: 800,
        height: 600,
        byteSize: 123_456,
        createdAt: "2026-08-01T00:00:00.000Z"
      }
    ],
    currentModerationReason: "Lý do cũ không được hiện",
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-02T00:00:00.000Z",
    ...overrides
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("OwnerListingDetail", () => {
  beforeEach(() => {
    Object.values(apiMocks).forEach((mock) => mock.mockReset());
    apiMocks.listPropertyTypes.mockResolvedValue([{ code: "STUDIO", label: "Studio" }]);
    apiMocks.listAmenities.mockResolvedValue([{ code: "WIFI", label: "Wi-Fi" }]);
    refresh.mockReset();
    refresh.mockResolvedValue();
    useAuthMock.mockReturnValue(authValue());
  });

  it.each(["abc", "0", "-1", "2147483648"])("rejects malformed id %s without any backend call", (listingId) => {
    render(<OwnerListingDetail listingId={listingId} />);
    expect(screen.getByRole("alert")).toHaveTextContent("không tồn tại hoặc bạn không thể truy cập");
    expect(apiMocks.getOwned).not.toHaveBeenCalled();
    expect(apiMocks.listPropertyTypes).not.toHaveBeenCalled();
    expect(apiMocks.listAmenities).not.toHaveBeenCalled();
  });

  it.each([
    ["loading", authValue({ status: "loading", user: null }), "Đang kiểm tra tài khoản"],
    ["anonymous", authValue({ status: "anonymous", user: null }), "đăng nhập bằng tài khoản chủ nhà"],
    ["TENANT", authValue({ user: { ...landlord, role: "TENANT" } }), "Trang này dành cho tài khoản chủ nhà"],
    ["ADMIN", authValue({ user: { ...landlord, role: "ADMIN" } }), "Trang này dành cho tài khoản chủ nhà"]
  ] as const)("gates %s without owner APIs", (_label, auth, expected) => {
    useAuthMock.mockReturnValue(auth);
    render(<OwnerListingDetail listingId="42" />);
    expect(screen.getByText(new RegExp(expected, "i"))).toBeInTheDocument();
    expect(apiMocks.getOwned).not.toHaveBeenCalled();
  });

  it("renders exact private location, a non-draggable map seam, and ordered read-only images", async () => {
    apiMocks.getOwned.mockResolvedValue(detail());
    render(<OwnerListingDetail listingId="42" />);
    expect(apiMocks.getOwned).toHaveBeenCalledWith(42, expect.any(AbortSignal));
    expect(await screen.findByRole("heading", { level: 1, name: "Studio chính chủ" })).toBeInTheDocument();
    expect(screen.getByText("101 Nguyễn Huệ, Quận 1")).toBeInTheDocument();
    expect(screen.getByText(/Vĩ độ 10\.7731/)).toHaveTextContent("Kinh độ 106.7032");
    expect(screen.getByRole("region", { name: "Bản đồ vị trí chính xác của tin" })).toBeInTheDocument();
    expect(screen.queryByText(/vị trí xấp xỉ/i)).not.toBeInTheDocument();
    expect(screen.getAllByRole("img").map((image) => image.getAttribute("aria-label"))).toEqual([
      "Ảnh thứ nhất",
      "Ảnh thứ hai"
    ]);
    expect(screen.getByText("2 ảnh · chỉ đọc")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /tải ảnh|xóa ảnh|sắp xếp/i })).not.toBeInTheDocument();
    expect(screen.queryByText("Lý do cũ không được hiện")).not.toBeInTheDocument();
  });

  it("shows zero-image submission guidance without introducing image mutation", async () => {
    apiMocks.getOwned.mockResolvedValue(detail({ status: "DRAFT", images: [] }));
    render(<OwnerListingDetail listingId="42" />);
    expect(await screen.findByText("Cần ít nhất một ảnh trước khi gửi duyệt.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /ảnh/i })).not.toBeInTheDocument();
  });

  it.each([
    ["REJECTED", "Lý do từ chối"],
    ["HIDDEN", "Lý do ẩn"]
  ] as const)("shows current moderation reason for %s", async (status, label) => {
    apiMocks.getOwned.mockResolvedValue(detail({ status, currentModerationReason: "Cần sửa nội dung" }));
    render(<OwnerListingDetail listingId="42" />);
    expect(await screen.findByText(label)).toBeInTheDocument();
    expect(screen.getByText("Cần sửa nội dung")).toBeInTheDocument();
  });

  it("collapses V1-13 404 and 403 into the same generic unavailable state", async () => {
    apiMocks.getOwned.mockRejectedValueOnce(
      new ApiError({ status: 404, code: "NOT_FOUND", message: "private", category: "backend" })
    );
    const view = render(<OwnerListingDetail listingId="42" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("không tồn tại hoặc bạn không thể truy cập");
    apiMocks.getOwned.mockRejectedValueOnce(
      new ApiError({ status: 403, code: "FORBIDDEN", message: "private", category: "backend" })
    );
    view.rerender(<OwnerListingDetail listingId="43" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("không tồn tại hoặc bạn không thể truy cập");
    expect(document.body).not.toHaveTextContent("private");
  });

  it("keeps retired values visible when independent lookups fail and retries only the failed lookup", async () => {
    apiMocks.getOwned.mockResolvedValue(detail());
    apiMocks.listPropertyTypes
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce([{ code: "STUDIO", label: "Studio" }]);
    render(<OwnerListingDetail listingId="42" />);
    expect(await screen.findByText("Không thể tải các loại phòng đang cho chọn.")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Studio cũ.*giá trị hiện tại/ })).toBeInTheDocument();
    expect(screen.getByLabelText(/Wi-Fi cũ.*không còn cho chọn mới/)).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Thử lại loại phòng" }));
    await waitFor(() => expect(apiMocks.listPropertyTypes).toHaveBeenCalledTimes(2));
    expect(apiMocks.listAmenities).toHaveBeenCalledOnce();
  });

  it("ignores an aborted stale V1-13 response after listing ID changes", async () => {
    const oldRequest = deferred<OwnerDetail>();
    const currentRequest = deferred<OwnerDetail>();
    apiMocks.getOwned.mockReturnValueOnce(oldRequest.promise).mockReturnValueOnce(currentRequest.promise);
    const view = render(<OwnerListingDetail listingId="41" />);
    await waitFor(() => expect(apiMocks.getOwned).toHaveBeenCalledOnce());
    view.rerender(<OwnerListingDetail listingId="42" />);
    await waitFor(() => expect(apiMocks.getOwned).toHaveBeenCalledTimes(2));
    await act(async () => currentRequest.resolve(detail({ title: "Tin hiện tại" })));
    expect(await screen.findByRole("heading", { name: "Tin hiện tại" })).toBeInTheDocument();
    await act(async () => oldRequest.resolve(detail({ title: "Tin cũ" })));
    expect(screen.queryByText("Tin cũ")).not.toBeInTheDocument();
  });
});
