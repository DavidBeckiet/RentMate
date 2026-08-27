import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContextValue } from "../../lib/auth/auth-provider";
import { listingSummary, roommateProfile, roommateRequest, tenantUser } from "./test-roommate-fixtures";

const apiMocks = vi.hoisted(() => ({
  listMine: vi.fn(),
  getProfile: vi.fn(),
  createRequest: vi.fn(),
  renewRequest: vi.fn(),
  linkListing: vi.fn(),
  unlinkListing: vi.fn(),
  cancelRequest: vi.fn()
}));
const listingMocks = vi.hoisted(() => ({ getPublicDetail: vi.fn() }));
const useAuthMock = vi.hoisted(() => vi.fn<() => AuthContextValue>());
const searchParamsMocks = vi.hoisted(() => ({ value: "" }));

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(searchParamsMocks.value) }));
vi.mock("../../lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("../../lib/api/client")>("../../lib/api/client");
  return { ...actual, api: { roommates: apiMocks, listings: listingMocks } };
});
vi.mock("../../lib/auth/auth-provider", () => ({ useAuth: useAuthMock }));

import { ApiError } from "../../lib/api/client";
import { RoommateRequestPage } from "./roommate-request-page";

function auth(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  return { status: "authenticated", user: tenantUser, error: null, refresh: vi.fn(), logout: vi.fn(), ...overrides };
}

describe("RoommateRequestPage", () => {
  beforeEach(() => {
    apiMocks.listMine.mockReset();
    apiMocks.getProfile.mockReset();
    apiMocks.createRequest.mockReset();
    apiMocks.renewRequest.mockReset();
    apiMocks.linkListing.mockReset();
    apiMocks.unlinkListing.mockReset();
    apiMocks.cancelRequest.mockReset();
    listingMocks.getPublicDetail.mockReset();
    searchParamsMocks.value = "";
    useAuthMock.mockReturnValue(auth());
    apiMocks.listMine.mockResolvedValue({ data: [], pagination: { page: 1, pageSize: 20, hasNextPage: false } });
    apiMocks.getProfile.mockResolvedValue(roommateProfile());
  });

  it("creates an unlinked Flow B request with area, budget, and move-in data", async () => {
    apiMocks.createRequest.mockResolvedValue(roommateRequest());
    render(<RoommateRequestPage />);

    await screen.findByRole("heading", { name: "Tạo yêu cầu tìm người ở ghép" });
    fireEvent.change(screen.getByLabelText("Khu vực quan tâm (bắt buộc)"), { target: { value: "Quận 3, Bình Thạnh" } });
    fireEvent.change(screen.getByLabelText("Ngân sách tối thiểu mỗi người (bắt buộc)"), {
      target: { value: "3000000" }
    });
    fireEvent.change(screen.getByLabelText("Ngân sách tối đa mỗi người (bắt buộc)"), { target: { value: "5000000" } });
    fireEvent.click(screen.getByRole("button", { name: "Tạo yêu cầu" }));

    await waitFor(() =>
      expect(apiMocks.createRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          listingId: null,
          preferredAreaKeys: ["Quận 3", "Bình Thạnh"],
          budgetMinPerPerson: 3_000_000,
          budgetMaxPerPerson: 5_000_000
        })
      )
    );
    expect(await screen.findByText("Yêu cầu đã được tạo.")).toBeInTheDocument();
  });

  it("creates a linked Flow A request from an eligible Listing Detail CTA context", async () => {
    searchParamsMocks.value = "listingId=23";
    listingMocks.getPublicDetail.mockResolvedValue({
      ...listingSummary(),
      description: "Không gian sáng, phù hợp để hai người cùng cân nhắc thuê.",
      images: [],
      landlordVerified: false
    });
    apiMocks.createRequest.mockResolvedValue(roommateRequest({ listingId: 23, listingMode: "LINKED" }));
    render(<RoommateRequestPage />);

    expect(await screen.findByText("Studio gần trung tâm")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Ngân sách tối thiểu mỗi người (bắt buộc)"), {
      target: { value: "3500000" }
    });
    fireEvent.change(screen.getByLabelText("Ngân sách tối đa mỗi người (bắt buộc)"), {
      target: { value: "5000000" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Tạo yêu cầu" }));

    await waitFor(() =>
      expect(apiMocks.createRequest).toHaveBeenCalledWith(
        expect.objectContaining({ listingId: 23, preferredAreaKeys: [] })
      )
    );
    expect(listingMocks.getPublicDetail).toHaveBeenCalledWith(23, expect.any(AbortSignal));
  });

  it("preselects a Listing Detail CTA target for an existing open request instead of creating another request", async () => {
    searchParamsMocks.value = "listingId=23";
    apiMocks.listMine.mockResolvedValue({
      data: [roommateRequest()],
      pagination: { page: 1, pageSize: 20, hasNextPage: false }
    });
    listingMocks.getPublicDetail.mockResolvedValue({
      ...listingSummary(),
      description: "Không gian sáng, phù hợp để hai người cùng cân nhắc thuê.",
      images: [],
      landlordVerified: false
    });
    apiMocks.linkListing.mockResolvedValue(roommateRequest({ listingId: 23, listingMode: "LINKED" }));
    render(<RoommateRequestPage />);

    expect(await screen.findByText(/Listing từ trang chi tiết đã được chọn\./)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Liên kết listing đã chọn" }));

    await waitFor(() => expect(apiMocks.linkListing).toHaveBeenCalledWith(42, 23));
    expect(apiMocks.createRequest).not.toHaveBeenCalled();
  });

  it("keeps an unavailable linked open request manageable through unlink or confirmed cancel", async () => {
    apiMocks.listMine.mockResolvedValue({
      data: [
        roommateRequest({
          listingId: 23,
          listingMode: "LINKED",
          listing: listingSummary(),
          signals: { profileCompleted: true, requestOpen: true, listingCurrentlyAvailable: false }
        })
      ],
      pagination: { page: 1, pageSize: 20, hasNextPage: false }
    });
    apiMocks.unlinkListing.mockResolvedValue(roommateRequest());
    apiMocks.cancelRequest.mockResolvedValue(
      roommateRequest({
        status: "CANCELLED",
        signals: { profileCompleted: true, requestOpen: false, listingCurrentlyAvailable: null }
      })
    );
    render(<RoommateRequestPage />);

    expect(await screen.findByText("Listing không còn khả dụng")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Gỡ liên kết listing" }));
    await waitFor(() => expect(apiMocks.unlinkListing).toHaveBeenCalledWith(42));

    fireEvent.click(screen.getByRole("button", { name: "Hủy yêu cầu" }));
    fireEvent.click(screen.getByRole("button", { name: "Xác nhận hủy yêu cầu" }));
    await waitFor(() => expect(apiMocks.cancelRequest).toHaveBeenCalledWith(42));
  });

  it("guides a tenant with no available profile to profile setup before request creation", async () => {
    apiMocks.getProfile.mockRejectedValue(
      new ApiError({ status: 404, code: "RESOURCE_NOT_FOUND", message: "private", category: "backend" })
    );
    render(<RoommateRequestPage />);
    expect(await screen.findByRole("heading", { name: "Hoàn thành hồ sơ trước khi tạo yêu cầu" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Thiết lập hồ sơ ở ghép" })).toHaveAttribute("href", "/roommates/profile");
    expect(apiMocks.createRequest).not.toHaveBeenCalled();
  });

  it("keeps an expired request available for renewal and confirms the new cycle", async () => {
    apiMocks.listMine.mockResolvedValue({
      data: [
        roommateRequest({
          status: "EXPIRED",
          signals: { profileCompleted: true, requestOpen: false, listingCurrentlyAvailable: null }
        })
      ],
      pagination: { page: 1, pageSize: 20, hasNextPage: false }
    });
    apiMocks.renewRequest.mockResolvedValue(roommateRequest({ status: "OPEN", expiresAt: "2026-10-20T00:00:00.000Z" }));
    render(<RoommateRequestPage />);

    expect(await screen.findByRole("button", { name: "Gia hạn yêu cầu" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Gia hạn yêu cầu" }));
    await waitFor(() => expect(apiMocks.renewRequest).toHaveBeenCalledWith(42));
    expect(
      await screen.findByText("Yêu cầu đã được gia hạn thêm 30 ngày. Các lời quan tâm cũ không được khôi phục.")
    ).toBeInTheDocument();
  });
});
