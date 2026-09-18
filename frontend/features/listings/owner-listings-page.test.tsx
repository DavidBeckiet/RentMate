import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContextValue } from "../../lib/auth/auth-provider";
import type {
  ApiPage,
  LandlordLead,
  ListingBusinessStatus,
  OwnerListingDetail,
  OwnerListingPage,
  OwnerListingSummary,
  OwnedListingQuery,
  UserProfile
} from "../../types/api";
import { LandlordCommandBarProvider, useLandlordCommandBar } from "../../components/ui/landlord-command-bar";

const apiMocks = vi.hoisted(() => ({
  listOwned: vi.fn(),
  getOwned: vi.fn(),
  createDraft: vi.fn(),
  duplicate: vi.fn(),
  updateBusinessStatus: vi.fn(),
  confirmAvailability: vi.fn(),
  listLeads: vi.fn()
}));
const navigationMocks = vi.hoisted(() => ({ query: "", push: vi.fn(), replace: vi.fn() }));
const useAuthMock = vi.hoisted(() => vi.fn<() => AuthContextValue>());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: navigationMocks.push, replace: navigationMocks.replace }),
  useSearchParams: () => new URLSearchParams(navigationMocks.query)
}));
vi.mock("../../lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("../../lib/api/client")>("../../lib/api/client");
  return {
    ...actual,
    api: {
      listings: {
        listOwned: apiMocks.listOwned,
        getOwned: apiMocks.getOwned,
        createDraft: apiMocks.createDraft,
        duplicate: apiMocks.duplicate,
        updateBusinessStatus: apiMocks.updateBusinessStatus,
        confirmAvailability: apiMocks.confirmAvailability
      },
      leads: { list: apiMocks.listLeads }
    }
  };
});
vi.mock("../../lib/auth/auth-provider", () => ({ useAuth: useAuthMock }));
vi.mock("./owner-listing-card", () => ({
  OwnerListingCard: ({
    listing,
    onDuplicate,
    duplicatePending,
    onBusinessStatusChange,
    businessStatusPending,
    onInspect,
    selected
  }: {
    listing: OwnerListingSummary;
    onDuplicate?: () => void;
    duplicatePending?: boolean;
    onBusinessStatusChange?: (status: ListingBusinessStatus) => void;
    businessStatusPending?: boolean;
    onInspect?: () => void;
    selected?: boolean;
  }) => (
    <article data-selected={selected || undefined}>
      <h2>{listing.title ?? "Tin đăng chưa có tiêu đề"}</h2>
      <span>{listing.status}</span>
      {listing.currentModerationReason ? <p>{listing.currentModerationReason}</p> : null}
      {onDuplicate ? (
        <button
          type="button"
          aria-label={duplicatePending ? "Đang nhân bản…" : "Nhân bản"}
          disabled={duplicatePending}
          onClick={onDuplicate}
        />
      ) : null}
      {onBusinessStatusChange ? (
        <select
          aria-label={"Tình trạng phòng cho " + listing.title}
          value={listing.businessStatus}
          disabled={businessStatusPending}
          onChange={(event) => onBusinessStatusChange(event.target.value as ListingBusinessStatus)}
        >
          <option value="AVAILABLE">Còn phòng</option>
          <option value="RENTED">Đã thuê</option>
          <option value="PAUSED">Tạm dừng</option>
          <option value="UNKNOWN">Chưa xác định</option>
        </select>
      ) : null}
      {onInspect ? (
        <>
          <button type="button" aria-label={`Xem chi tiết chỗ ở: ${listing.title ?? "tin đăng"}`} onClick={onInspect}>
            Xem nhanh
          </button>
          <a href={`/landlord/listings/${listing.id}`}>Chỉnh sửa</a>
        </>
      ) : null}
    </article>
  )
}));

import { ApiError } from "../../lib/api/client";
import { OwnerListingsPage } from "./owner-listings-page";

const refresh = vi.fn<() => Promise<void>>();
const landlord: UserProfile = {
  id: 7,
  displayName: null,
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

function listing(id: number, title: string, overrides: Partial<OwnerListingSummary> = {}): OwnerListingSummary {
  return {
    id,
    status: "DRAFT",
    businessStatus: "UNKNOWN",
    title,
    monthlyRent: null,
    maxOccupants: null,
    areaName: null,
    availabilityStatus: "NOT_APPLICABLE",
    availabilityConfirmedAt: null,
    availabilityExpiresAt: null,
    propertyType: null,
    coverImage: null,
    currentModerationReason: null,
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...overrides
  };
}

function detail(overrides: Partial<OwnerListingDetail> = {}): OwnerListingDetail {
  return {
    id: 88,
    status: "DRAFT",
    businessStatus: "UNKNOWN",
    title: null,
    description: null,
    monthlyRent: null,
    roomAreaSqm: null,
    maxOccupants: null,
    addressText: null,
    areaName: null,
    latitude: null,
    longitude: null,
    availabilityStatus: "NOT_APPLICABLE",
    availabilityConfirmedAt: null,
    availabilityExpiresAt: null,
    propertyType: null,
    amenities: [],
    images: [],
    currentModerationReason: null,
    createdAt: "2026-08-31T00:00:00.000Z",
    updatedAt: "2026-08-31T00:00:00.000Z",
    ...overrides
  };
}

function page<T>(data: readonly T[], currentPage = 1, hasNextPage = false, pageSize = 20): ApiPage<T> {
  return { data, pagination: { page: currentPage, pageSize, hasNextPage } };
}

let currentListings: OwnerListingSummary[];
let portfolioPages: OwnerListingSummary[][];
let currentPageHasNext: boolean;
let ownerHistory: boolean | undefined;
let leadPages: LandlordLead[][];

function ownerPage(
  data: readonly OwnerListingSummary[],
  currentPage = 1,
  hasNextPage = false,
  pageSize = 20
): OwnerListingPage {
  return {
    ...page(data, currentPage, hasNextPage, pageSize),
    ...(typeof ownerHistory === "boolean" ? { metadata: { hasEverApprovedListing: ownerHistory } } : {})
  };
}

function mockOwnedListings() {
  apiMocks.listOwned.mockImplementation(async (query: OwnedListingQuery = {}) => {
    const requestedPage = query.page ?? 1;
    if (query.pageSize === 100 && query.status === undefined && query.businessStatus === undefined) {
      const data = portfolioPages[requestedPage - 1] ?? [];
      return ownerPage(data, requestedPage, requestedPage < portfolioPages.length, 100);
    }
    return ownerPage(currentListings, requestedPage, currentPageHasNext, query.pageSize ?? 20);
  });
}

function mockLeads() {
  apiMocks.listLeads.mockImplementation(async (query: { page?: number } = {}) => {
    const requestedPage = query.page ?? 1;
    return page(leadPages[requestedPage - 1] ?? [], requestedPage, requestedPage < leadPages.length, 100);
  });
}

function setInventory(listings: OwnerListingSummary[], hasEverApprovedListing: boolean | undefined) {
  currentListings = listings;
  portfolioPages = [listings];
  ownerHistory = hasEverApprovedListing;
  currentPageHasNext = false;
}

function CommandBarSearchProxy() {
  const commandBar = useLandlordCommandBar();
  if (!commandBar?.searchEnabled) return null;
  return (
    <input
      type="search"
      aria-label="Tìm tin theo tên, khu vực hoặc loại phòng"
      value={commandBar.searchValue}
      onChange={(event) => commandBar.onSearchChange(event.target.value)}
    />
  );
}

describe("OwnerListingsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    navigationMocks.query = "";
    setInventory([], undefined);
    leadPages = [[]];
    refresh.mockResolvedValue(undefined);
    useAuthMock.mockReturnValue(authValue());
    mockOwnedListings();
    mockLeads();
    apiMocks.getOwned.mockImplementation(async (id: number) => detail({ id }));
    apiMocks.createDraft.mockResolvedValue(detail({ id: 88 }));
    apiMocks.duplicate.mockResolvedValue(detail({ id: 89 }));
    apiMocks.updateBusinessStatus.mockResolvedValue(detail({ id: 42, businessStatus: "RENTED" }));
  });

  it.each([
    ["anonymous", authValue({ status: "anonymous", user: null }), "Đăng nhập để quản lý tin"],
    ["tenant", authValue({ user: { ...landlord, role: "TENANT" } }), "Trang này dành cho tài khoản người cho thuê"],
    ["admin", authValue({ user: { ...landlord, role: "ADMIN" } }), "Trang này dành cho tài khoản người cho thuê"]
  ] as const)("gates %s without calling owner APIs", (_label, auth, expected) => {
    useAuthMock.mockReturnValue(auth);
    render(<OwnerListingsPage />);
    expect(screen.getByText(new RegExp(expected))).toBeInTheDocument();
    expect(apiMocks.listOwned).not.toHaveBeenCalled();
    expect(apiMocks.listLeads).not.toHaveBeenCalled();
  });

  it("gates an auth error and delegates retry to auth.refresh", () => {
    useAuthMock.mockReturnValue(
      authValue({
        status: "error",
        user: null,
        error: new ApiError({ status: 500, code: "X", message: "private", category: "backend" })
      })
    );
    render(<OwnerListingsPage />);
    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    expect(refresh).toHaveBeenCalledOnce();
    expect(apiMocks.listOwned).not.toHaveBeenCalled();
  });

  it("shows the first-time launchpad only for a truly empty inventory", async () => {
    setInventory([], true);
    render(<OwnerListingsPage />);

    expect(await screen.findByRole("heading", { name: "Bạn chưa có tin nào." })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Tạo tin đầu tiên/ })).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByText(/Tổng tin|thống kê|không có tin đăng/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
  });

  it("shows State B draft progress from actual missing server-required fields", async () => {
    const draft = listing(15, "Phòng nhiều nắng", {
      areaName: "Bình Thạnh",
      monthlyRent: 6_000_000,
      propertyType: { code: "ROOM", label: "Room" }
    });
    setInventory([draft], false);
    apiMocks.getOwned.mockResolvedValue(
      detail({ id: 15, title: "Phòng nhiều nắng", monthlyRent: 6_000_000, areaName: "Bình Thạnh" })
    );
    render(<OwnerListingsPage />);

    expect(await screen.findByRole("heading", { name: "Tiếp tục hoàn thiện tin đăng" })).toBeInTheDocument();
    const progress = await screen.findByRole("progressbar", { name: "Tiến độ hoàn thiện tin" });
    const primaryAction = screen.getByRole("link", { name: /Tiếp tục hoàn thiện/ });
    expect(progress).toHaveAttribute("aria-valuenow", "3");
    expect((primaryAction.compareDocumentPosition(progress) & 4) !== 0).toBe(true);
    expect(screen.getByText("Loại phòng")).toBeInTheDocument();
    expect(screen.getByText("Phòng trọ")).toBeInTheDocument();
    expect(screen.queryByText("Room")).not.toBeInTheDocument();
    expect(screen.getByText("Ảnh căn phòng")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Lọc tin đăng" })).not.toBeInTheDocument();
    expect(primaryAction).toHaveAttribute("href", "/landlord/listings/15");
    expect(apiMocks.getOwned).toHaveBeenCalledWith(15, expect.any(AbortSignal));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows a calm pending-review state without suggesting resubmission", async () => {
    setInventory([listing(21, "Căn hộ đang xét", { status: "PENDING" })], false);
    render(<OwnerListingsPage />);

    expect(await screen.findByRole("heading", { name: "Tin đăng đang được xem xét" })).toBeInTheDocument();
    expect(screen.getByText(/Bạn không cần gửi lại/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Xem trạng thái duyệt/ })).toHaveAttribute("href", "/landlord/listings/21");
    expect(screen.getByRole("button", { name: /Tạo thêm tin/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Hồ sơ chủ nhà/ })).toHaveAttribute("href", "/landlord/profile");
    expect(apiMocks.getOwned).not.toHaveBeenCalled();
  });

  it.each([
    ["INACTIVE", "Tin đăng đang tạm dừng", "Tin đang tạm dừng."],
    ["HIDDEN", "Tin đăng đang ẩn", "Tin đang được ẩn."]
  ] as const)("keeps a pre-live %s listing focused on its current state", async (status, heading, copy) => {
    setInventory([listing(25, "Tin chưa hoạt động", { status })], false);
    render(<OwnerListingsPage />);

    expect(await screen.findByRole("heading", { name: heading })).toBeInTheDocument();
    expect(screen.getByText(new RegExp(copy))).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Mở tin để quản lý/ })).toHaveAttribute("href", "/landlord/listings/25");
    expect(screen.queryByRole("link", { name: /Xem trạng thái duyệt/ })).not.toBeInTheDocument();
  });

  it("puts the rejection reason and Fix listing action in the single featured progress experience", async () => {
    setInventory(
      [listing(31, "Phòng cần cập nhật", { status: "REJECTED", currentModerationReason: "Bổ sung ảnh phòng tắm." })],
      false
    );
    render(<OwnerListingsPage />);

    expect(await screen.findByRole("heading", { name: "Tin cần được chỉnh sửa" })).toBeInTheDocument();
    expect(screen.getByText("Bổ sung ảnh phòng tắm.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Sửa tin/ })).toHaveAttribute("href", "/landlord/listings/31");
    expect(screen.getAllByText("Bổ sung ảnh phòng tắm.")).toHaveLength(1);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("prioritizes rejected, then draft, then pending work in State B", async () => {
    setInventory(
      [
        listing(1, "Tin đang chờ", { status: "PENDING" }),
        listing(2, "Tin nháp", { status: "DRAFT" }),
        listing(3, "Tin cần sửa", { status: "REJECTED", currentModerationReason: "Sửa mô tả." })
      ],
      false
    );
    render(<OwnerListingsPage />);

    expect(await screen.findByRole("heading", { name: "Tin cần được chỉnh sửa" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Sửa tin/ })).toHaveAttribute("href", "/landlord/listings/3");
    expect(apiMocks.getOwned).not.toHaveBeenCalled();
  });

  it.each([
    ["DRAFT", "Đang soạn"],
    ["PENDING", "Đang chờ duyệt"]
  ] as const)("does not regress a historically approved current %s listing to State B", async (status, title) => {
    setInventory([listing(41, title, { status })], true);
    render(<OwnerListingsPage />);

    expect(await screen.findByRole("heading", { name: /Quản lý \d+ phòng cho thuê/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /hoàn thiện tin đăng|đang được xem xét/i })).not.toBeInTheDocument();
    expect(apiMocks.getOwned).not.toHaveBeenCalled();
  });

  it("uses a neutral inventory-safe view when approval-history metadata is missing", async () => {
    setInventory([listing(51, "Tin hiện có")], undefined);
    render(<OwnerListingsPage />);

    expect(await screen.findByRole("heading", { name: /Quản lý \d+ phòng cho thuê/ })).toBeInTheDocument();
    expect(screen.queryByText(/tiếp tục xem và quản lý các tin bên dưới/i)).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Tin hiện có" })).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /Bạn chưa có tin nào/ })).not.toBeInTheDocument();
  });

  it("does not show an attention strip when no actionable owner task exists", async () => {
    setInventory([listing(61, "Tin đang vận hành", { status: "APPROVED", businessStatus: "AVAILABLE" })], true);
    render(<OwnerListingsPage />);

    await screen.findByRole("heading", { name: /Quản lý \d+ phòng cho thuê/ });
    await waitFor(() => expect(apiMocks.listLeads).toHaveBeenCalled());
    expect(screen.queryByRole("region", { name: "Việc cần xử lý" })).not.toBeInTheDocument();
  });

  it("shows only actual actionable attention tasks in State C", async () => {
    setInventory([listing(62, "Tin cần xác nhận", { status: "APPROVED", availabilityStatus: "REMINDER_DUE" })], true);
    leadPages = [
      [
        {
          inquiryId: 4,
          listingId: 62,
          status: "NEW",
          contactPhone: null,
          preferredContactAt: null,
          createdAt: "2026-08-30T00:00:00.000Z",
          updatedAt: "2026-08-31T00:00:00.000Z",
          lastMessage: null,
          needsReply: false,
          hasUnreadTenantMessages: true,
          note: null,
          noteUpdatedAt: null,
          reminderAt: null,
          reminderUpdatedAt: null
        }
      ]
    ];
    render(<OwnerListingsPage />);

    const tasks = await screen.findByRole("region", { name: "Việc cần xử lý" });
    expect(await within(tasks).findByRole("link", { name: /Tin nhắn mới/ })).toHaveAttribute("href", "/landlord/leads");
    expect(within(tasks).getByRole("link", { name: /Xác nhận tình trạng phòng/ })).toHaveAttribute(
      "href",
      "/landlord/listings/62"
    );
  });

  it("offers a recovery task for an automatically paused listing", async () => {
    setInventory(
      [
        listing(63, "Tin tạm dừng tự động", {
          status: "APPROVED",
          businessStatus: "PAUSED",
          availabilityStatus: "AUTO_PAUSED"
        })
      ],
      true
    );
    render(<OwnerListingsPage />);

    await screen.findByRole("heading", { name: /Quản lý \d+ phòng cho thuê/ });
    const tasks = await screen.findByRole("region", { name: "Việc cần xử lý" });
    expect(await within(tasks).findByRole("link", { name: /Xác nhận để mở lại tin/ })).toHaveAttribute(
      "href",
      "/landlord/listings/63"
    );
  });

  it("uses canonical URL state, preserves server order and navigates filters and pagination", async () => {
    navigationMocks.query = "status=approved&page=2&pageSize=40&utm_source=test";
    currentListings = [
      listing(2, "Tin thứ hai", { status: "APPROVED" }),
      listing(1, "Tin thứ nhất", { status: "APPROVED" })
    ];
    currentPageHasNext = true;
    portfolioPages = [currentListings];
    ownerHistory = true;
    render(<OwnerListingsPage />);

    expect(await screen.findByRole("heading", { name: /Quản lý \d+ phòng cho thuê/ })).toBeInTheDocument();
    expect(apiMocks.listOwned).toHaveBeenCalledWith(
      { status: "APPROVED", page: 2, pageSize: 40 },
      expect.any(AbortSignal)
    );
    expect(screen.getAllByRole("article").map((card) => card.textContent)).toEqual([
      expect.stringContaining("Tin thứ hai"),
      expect.stringContaining("Tin thứ nhất")
    ]);
    expect(screen.getByText("Trang 2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Trang trước" }));
    expect(navigationMocks.push).toHaveBeenCalledWith("/landlord?status=APPROVED&pageSize=40");
    fireEvent.change(screen.getByLabelText("Tình trạng phòng"), { target: { value: "RENTED" } });
    expect(navigationMocks.push).toHaveBeenCalledWith("/landlord?status=APPROVED&businessStatus=RENTED&pageSize=40");
  });

  it("shows six property cards per default page and keeps server pagination visible", async () => {
    const sixListings = Array.from({ length: 6 }, (_, index) =>
      listing(index + 101, `Phòng ${index + 1}`, { status: "APPROVED" })
    );
    setInventory(sixListings, true);
    currentPageHasNext = true;
    render(<OwnerListingsPage />);

    await screen.findByRole("heading", { name: /Quản lý \d+ phòng cho thuê/ });
    expect(screen.getAllByRole("article")).toHaveLength(6);
    expect(screen.getByText("Trang 1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Trang sau" })).toBeEnabled();
    expect(apiMocks.listOwned).toHaveBeenCalledWith({ page: 1, pageSize: 6 }, expect.any(AbortSignal));
  });

  it("searches loaded owner inventory by title, area, or property type", async () => {
    setInventory(
      [
        listing(91, "Căn hộ trung tâm", { areaName: "Quận 1" }),
        listing(92, "Studio nhiều nắng", { areaName: "Bình Thạnh" })
      ],
      true
    );
    render(
      <LandlordCommandBarProvider>
        <OwnerListingsPage />
        <CommandBarSearchProxy />
      </LandlordCommandBarProvider>
    );

    await screen.findByRole("heading", { name: /Quản lý \d+ phòng cho thuê/ });
    fireEvent.change(await screen.findByRole("searchbox", { name: "Tìm tin theo tên, khu vực hoặc loại phòng" }), {
      target: { value: "Bình Thạnh" }
    });

    expect(await screen.findByRole("heading", { name: "Studio nhiều nắng" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Căn hộ trung tâm" })).not.toBeInTheDocument();
    expect(screen.getByText("1 tin khớp")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Trang tiếp" })).not.toBeInTheDocument();
  });

  it("opens a selected listing in the quick inspection panel and closes it without changing the route", async () => {
    setInventory(
      [
        listing(93, "Căn hộ có nắng", {
          status: "APPROVED",
          businessStatus: "AVAILABLE",
          areaName: "Quận 1",
          monthlyRent: 5_800_000
        })
      ],
      true
    );
    apiMocks.getOwned.mockResolvedValue(
      detail({
        id: 93,
        status: "APPROVED",
        businessStatus: "AVAILABLE",
        title: "Căn hộ có nắng",
        monthlyRent: 5_800_000,
        roomAreaSqm: 28,
        addressText: "128 Lê Lợi, P. Bến Thành, Q.1",
        areaName: "Quận 1",
        propertyType: { code: "ROOM", label: "Room" }
      })
    );
    render(<OwnerListingsPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Xem chi tiết chỗ ở: Căn hộ có nắng" }));

    const inspector = await screen.findByRole("complementary", { name: "Chi tiết chỗ ở" });
    expect(within(inspector).getByText("128 Lê Lợi, P. Bến Thành, Q.1")).toBeInTheDocument();
    expect(within(inspector).getByText("5.800.000 ₫/tháng")).toBeInTheDocument();
    expect(within(inspector).getByText("Phòng trọ")).toBeInTheDocument();
    expect(within(inspector).queryByText("Room")).not.toBeInTheDocument();
    expect(within(inspector).getByRole("link", { name: /Chỉnh sửa tin/ })).toHaveAttribute(
      "href",
      "/landlord/listings/93"
    );
    expect(navigationMocks.push).not.toHaveBeenCalled();

    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() =>
      expect(screen.queryByRole("complementary", { name: "Chi tiết chỗ ở" })).not.toBeInTheDocument()
    );
  });

  it("opens details from the visible page when the inventory snapshot is temporarily behind", async () => {
    const visibleListing = listing(95, "Phòng vừa cập nhật", {
      status: "APPROVED",
      businessStatus: "AVAILABLE"
    });
    currentListings = [visibleListing];
    portfolioPages = [[listing(94, "Tin cũ trong snapshot", { status: "APPROVED" })]];
    ownerHistory = true;
    apiMocks.getOwned.mockResolvedValue(detail({ id: 95, title: "Phòng vừa cập nhật", status: "APPROVED" }));

    render(<OwnerListingsPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Xem chi tiết chỗ ở: Phòng vừa cập nhật" }));

    expect(await screen.findByRole("complementary", { name: "Chi tiết chỗ ở" })).toBeInTheDocument();
    expect(apiMocks.getOwned).toHaveBeenCalledWith(95, expect.any(AbortSignal));
  });

  it("keeps availability confirmation in the existing quick action contract", async () => {
    setInventory(
      [
        listing(94, "Căn hộ cần xác nhận", {
          status: "APPROVED",
          businessStatus: "AVAILABLE",
          availabilityStatus: "REMINDER_DUE"
        })
      ],
      true
    );
    const ownedDetail = detail({
      id: 94,
      status: "APPROVED",
      businessStatus: "AVAILABLE",
      title: "Căn hộ cần xác nhận",
      availabilityStatus: "REMINDER_DUE",
      availabilityConfirmedAt: "2026-08-30T00:00:00.000Z"
    });
    const confirmedDetail = detail({
      ...ownedDetail,
      availabilityStatus: "CURRENT",
      availabilityConfirmedAt: "2026-09-15T00:00:00.000Z"
    });
    apiMocks.getOwned.mockResolvedValue(ownedDetail);
    apiMocks.confirmAvailability.mockResolvedValue(confirmedDetail);
    render(<OwnerListingsPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Xem chi tiết chỗ ở: Căn hộ cần xác nhận" }));
    const inspector = await screen.findByRole("complementary", { name: "Chi tiết chỗ ở" });
    fireEvent.click(within(inspector).getByRole("button", { name: "Xác nhận còn phòng" }));

    await waitFor(() => expect(apiMocks.confirmAvailability).toHaveBeenCalledWith(94, expect.any(AbortSignal)));
    expect(within(inspector).getByText(/Xác nhận gần nhất:/)).toBeInTheDocument();
  });

  it("keeps filtered empty results distinct from the empty launchpad", async () => {
    navigationMocks.query = "status=REJECTED";
    setInventory([listing(70, "Tin khác", { status: "APPROVED" })], true);
    currentListings = [];
    render(<OwnerListingsPage />);

    expect(await screen.findByRole("heading", { name: /Quản lý \d+ phòng cho thuê/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Không có tin khớp với bộ lọc này" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /Bạn chưa có tin nào/ })).not.toBeInTheDocument();
  });

  it("ignores stale or aborted listing responses after URL navigation", async () => {
    const inventoryListing = listing(70, "Tin đang vận hành", { status: "APPROVED" });
    setInventory([inventoryListing], true);
    let resolveFirst!: (value: OwnerListingPage) => void;
    let resolveSecond!: (value: OwnerListingPage) => void;
    const first = new Promise<OwnerListingPage>((resolve) => (resolveFirst = resolve));
    const second = new Promise<OwnerListingPage>((resolve) => (resolveSecond = resolve));
    let listingRequest = 0;
    apiMocks.listOwned.mockImplementation((query: OwnedListingQuery = {}) => {
      if (query.pageSize === 100) return Promise.resolve(ownerPage([inventoryListing], 1, false, 100));
      listingRequest += 1;
      return listingRequest === 1 ? first : second;
    });
    const view = render(<OwnerListingsPage />);
    await waitFor(() => expect(listingRequest).toBe(1));
    navigationMocks.query = "page=2";
    view.rerender(<OwnerListingsPage />);
    await waitFor(() => expect(listingRequest).toBe(2));
    await act(async () => resolveSecond(ownerPage([listing(72, "Trang hai")], 2)));
    expect(await screen.findByRole("heading", { name: "Trang hai" })).toBeInTheDocument();
    await act(async () => resolveFirst(ownerPage([listing(71, "Kết quả cũ")])));
    expect(screen.queryByRole("heading", { name: "Kết quả cũ" })).not.toBeInTheDocument();
  });

  it.each([
    [403, "chỉ dành cho tài khoản người cho thuê"],
    [422, "Liên kết quản lý tin đăng không hợp lệ"]
  ] as const)("renders a safe %s error and retries explicitly", async (status, message) => {
    apiMocks.listOwned.mockRejectedValueOnce(
      new ApiError({ status, code: "X", message: "private", category: "backend" })
    );
    render(<OwnerListingsPage />);
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    expect(await screen.findByRole("heading", { name: "Bạn chưa có tin nào." })).toBeInTheDocument();
  });

  it("refreshes auth at most once after a 401 without request-loop replay", async () => {
    apiMocks.listOwned.mockRejectedValue(
      new ApiError({ status: 401, code: "X", message: "private", category: "backend" })
    );
    render(<OwnerListingsPage />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Phiên đăng nhập không còn hợp lệ");
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
  });

  it("creates one draft and navigates to the server-returned listing route", async () => {
    let resolveCreation!: (value: OwnerListingDetail) => void;
    apiMocks.createDraft.mockReturnValue(new Promise<OwnerListingDetail>((resolve) => (resolveCreation = resolve)));
    render(<OwnerListingsPage />);

    fireEvent.click(await screen.findByRole("button", { name: /Tạo tin đầu tiên/ }));
    expect(apiMocks.createDraft).toHaveBeenCalledOnce();
    expect(apiMocks.createDraft).toHaveBeenCalledWith({}, expect.any(AbortSignal));
    await act(async () => resolveCreation(detail({ id: 88 })));
    expect(navigationMocks.push).toHaveBeenCalledWith("/landlord/listings/88");
  });

  it("keeps an ambiguous create network outcome and never retries automatically", async () => {
    apiMocks.createDraft.mockRejectedValue(
      new ApiError({ status: null, code: "NETWORK_ERROR", message: "private", category: "network" })
    );
    render(<OwnerListingsPage />);

    fireEvent.click(await screen.findByRole("button", { name: /Tạo tin đầu tiên/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Không thể xác nhận việc tạo bản nháp");
    expect(apiMocks.createDraft).toHaveBeenCalledOnce();
    expect(navigationMocks.push).not.toHaveBeenCalled();
  });

  it("duplicates once through the secondary action and navigates to the new draft", async () => {
    setInventory([listing(81, "Tin gốc")], true);
    render(<OwnerListingsPage />);
    await screen.findByRole("heading", { name: /Quản lý \d+ phòng cho thuê/ });
    fireEvent.click(screen.getByRole("button", { name: "Xem chi tiết chỗ ở: Tin gốc" }));
    const inspector = await screen.findByRole("complementary", { name: "Chi tiết chỗ ở" });
    fireEvent.click(within(inspector).getByRole("button", { name: "Nhân bản" }));

    await waitFor(() => expect(apiMocks.duplicate).toHaveBeenCalledOnce());
    expect(apiMocks.duplicate).toHaveBeenCalledWith(81, expect.any(AbortSignal));
    expect(navigationMocks.push).toHaveBeenCalledWith("/landlord/listings/89");
  });

  it("updates business status through the existing owner endpoint", async () => {
    setInventory([listing(42, "Tin còn phòng", { status: "APPROVED", businessStatus: "AVAILABLE" })], true);
    render(<OwnerListingsPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Xem chi tiết chỗ ở: Tin còn phòng" }));
    const inspector = await screen.findByRole("complementary", { name: "Chi tiết chỗ ở" });
    fireEvent.change(await within(inspector).findByLabelText("Tình trạng phòng cho Tin còn phòng"), {
      target: { value: "RENTED" }
    });
    await waitFor(() => expect(apiMocks.updateBusinessStatus).toHaveBeenCalledOnce());
    expect(apiMocks.updateBusinessStatus).toHaveBeenCalledWith(
      42,
      { businessStatus: "RENTED" },
      expect.any(AbortSignal)
    );
    expect(await screen.findByRole("status")).toHaveTextContent("Đã cập nhật tình trạng phòng.");
  });
});
