import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContextValue } from "../../lib/auth/auth-provider";
import type { ListingStatus, OwnerListingDetail, UserProfile } from "../../types/api";

const apiMocks = vi.hoisted(() => ({
  submit: vi.fn(),
  deactivate: vi.fn(),
  reactivate: vi.fn(),
  deleteOwned: vi.fn()
}));
const routerMocks = vi.hoisted(() => ({ replace: vi.fn() }));
const useAuthMock = vi.hoisted(() => vi.fn<() => AuthContextValue>());

vi.mock("next/navigation", () => ({ useRouter: () => routerMocks }));
vi.mock("../../lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("../../lib/api/client")>("../../lib/api/client");
  return { ...actual, api: { listings: apiMocks } };
});
vi.mock("../../lib/auth/auth-provider", () => ({ useAuth: useAuthMock }));

import { ApiError } from "../../lib/api/client";
import { OwnerLifecycleActions } from "./owner-lifecycle-actions";

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

function detail(status: ListingStatus, overrides: Partial<OwnerListingDetail> = {}): OwnerListingDetail {
  return {
    id: 42,
    status,
    title: "Studio",
    description: "Mô tả",
    monthlyRent: 7_500_000,
    roomAreaSqm: 28.5,
    maxOccupants: null,
    addressText: "101 Nguyễn Huệ",
    areaName: "Quận 1",
    latitude: 10.77,
    longitude: 106.7,
    availabilityStatus: "NOT_APPLICABLE",
    availabilityConfirmedAt: null,
    availabilityExpiresAt: null,
    propertyType: { code: "STUDIO", label: "Studio" },
    amenities: [],
    images: [
      {
        id: 1,
        url: "https://example.com/room.webp",
        altText: null,
        displayOrder: 1,
        format: "webp",
        width: 800,
        height: 600,
        byteSize: 123_456,
        createdAt: "2026-08-01T00:00:00.000Z"
      }
    ],
    currentModerationReason: null,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-02T00:00:00.000Z",
    ...overrides,
    businessStatus: overrides.businessStatus ?? "UNKNOWN"
  };
}

const onDetailChange = vi.fn();
const onEditorFeedback = vi.fn();
const onRefresh = vi.fn();

function renderActions(status: ListingStatus, blocked = false, overrides: Partial<OwnerListingDetail> = {}) {
  return render(
    <OwnerLifecycleActions
      detail={detail(status, overrides)}
      blocked={blocked}
      onDetailChange={onDetailChange}
      onEditorFeedback={onEditorFeedback}
      onRefresh={onRefresh}
    />
  );
}

function backendError(
  status: number,
  code = "SAFE_ERROR",
  details: ConstructorParameters<typeof ApiError>[0]["details"] = []
) {
  return new ApiError({ status, code, message: "private", details, requestId: "req-action", category: "backend" });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("OwnerLifecycleActions", () => {
  beforeEach(() => {
    Object.values(apiMocks).forEach((mock) => mock.mockReset());
    routerMocks.replace.mockReset();
    refresh.mockReset();
    refresh.mockResolvedValue();
    onDetailChange.mockReset();
    onEditorFeedback.mockReset();
    onRefresh.mockReset();
    useAuthMock.mockReturnValue({ status: "authenticated", user: landlord, error: null, refresh, logout: vi.fn() });
  });

  it.each([
    ["DRAFT", ["Gửi duyệt", "Xóa tin"]],
    ["PENDING", []],
    ["APPROVED", ["Ngừng hiển thị"]],
    ["REJECTED", []],
    ["HIDDEN", ["Gửi duyệt"]],
    ["INACTIVE", ["Kích hoạt lại"]]
  ] as const)("renders only the canonical %s action matrix", (status, labels) => {
    renderActions(status);
    for (const label of ["Gửi duyệt", "Xóa tin", "Ngừng hiển thị", "Kích hoạt lại"]) {
      const button = screen.queryByRole("button", { name: label });
      if ((labels as readonly string[]).includes(label)) expect(button).toBeInTheDocument();
      else expect(button).not.toBeInTheDocument();
    }
  });

  it("disables every rendered lifecycle action while the editor is dirty", () => {
    renderActions("DRAFT", true);
    expect(screen.getByText(/thay đổi chưa lưu/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Gửi duyệt" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Xóa tin" })).toBeDisabled();
    expect(Object.values(apiMocks).every((mock) => mock.mock.calls.length === 0)).toBe(true);
  });

  it.each(["DRAFT", "HIDDEN"] as const)(
    "submits %s without a body and renders the returned canonical state",
    async (status) => {
      const returned = detail("PENDING", { updatedAt: "2026-08-03T00:00:00.000Z" });
      apiMocks.submit.mockResolvedValue(returned);
      renderActions(status);
      fireEvent.click(screen.getByRole("button", { name: "Gửi duyệt" }));
      await waitFor(() => expect(onDetailChange).toHaveBeenCalledWith(returned));
      expect(apiMocks.submit).toHaveBeenCalledWith(42, expect.any(AbortSignal));
    }
  );

  it("maps submit 422 scalar details and missing-image completeness safely", async () => {
    apiMocks.submit.mockRejectedValueOnce(
      backendError(422, "VALIDATION_FAILED", [{ field: "title", code: "REQUIRED", message: "Cần tiêu đề." }])
    );
    const view = renderActions("DRAFT");
    fireEvent.click(screen.getByRole("button", { name: "Gửi duyệt" }));
    await waitFor(() =>
      expect(onEditorFeedback).toHaveBeenCalledWith(expect.objectContaining({ fieldErrors: { title: "Cần tiêu đề." } }))
    );

    view.unmount();
    onEditorFeedback.mockReset();
    apiMocks.submit.mockRejectedValueOnce(
      backendError(422, "VALIDATION_FAILED", [{ field: "images", code: "IMAGE_REQUIRED", message: "private" }])
    );
    renderActions("DRAFT", false, { images: [] });
    fireEvent.click(screen.getByRole("button", { name: "Gửi duyệt" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Cần ít nhất một ảnh trước khi gửi duyệt");
    expect(onEditorFeedback).toHaveBeenCalledWith(
      expect.objectContaining({ formMessage: "Cần ít nhất một ảnh trước khi gửi duyệt." })
    );
  });

  it.each(["INVALID_LISTING_TRANSITION", "CONCURRENT_MODIFICATION"])(
    "handles submit 409 %s with explicit reload and no replay",
    async (code) => {
      apiMocks.submit.mockRejectedValue(backendError(409, code));
      renderActions("DRAFT");
      fireEvent.click(screen.getByRole("button", { name: "Gửi duyệt" }));
      expect(await screen.findByRole("alert")).toHaveTextContent("Trạng thái tin đã thay đổi");
      fireEvent.click(screen.getByRole("button", { name: "Tải lại tin" }));
      expect(onRefresh).toHaveBeenCalledOnce();
      expect(apiMocks.submit).toHaveBeenCalledOnce();
    }
  );

  it("does not optimistically transition or replay an ambiguous submit", async () => {
    const request = deferred<OwnerListingDetail>();
    apiMocks.submit.mockReturnValue(request.promise);
    const firstView = renderActions("DRAFT");
    fireEvent.click(screen.getByRole("button", { name: "Gửi duyệt" }));
    expect(onDetailChange).not.toHaveBeenCalled();
    await act(async () => request.resolve(detail("HIDDEN")));
    expect(onDetailChange).toHaveBeenCalledWith(expect.objectContaining({ status: "HIDDEN" }));

    firstView.unmount();
    onDetailChange.mockReset();
    apiMocks.submit.mockRejectedValue(
      new ApiError({ status: null, code: "NETWORK_ERROR", message: "private", category: "network" })
    );
    const view = renderActions("DRAFT");
    fireEvent.click(view.getByRole("button", { name: "Gửi duyệt" }));
    expect(await view.findByRole("alert")).toHaveTextContent("Không thể xác nhận trạng thái mới");
    expect(apiMocks.submit).toHaveBeenCalledTimes(2);
    expect(onDetailChange).not.toHaveBeenCalled();
  });

  it.each([
    ["APPROVED", "deactivate", "Ngừng hiển thị", "INACTIVE"],
    ["INACTIVE", "reactivate", "Kích hoạt lại", "APPROVED"]
  ] as const)("uses the server response for %s", async (before, method, label, returnedStatus) => {
    const returned = detail(returnedStatus);
    apiMocks[method].mockResolvedValue(returned);
    renderActions(before);
    fireEvent.click(screen.getByRole("button", { name: label }));
    await waitFor(() => expect(onDetailChange).toHaveBeenCalledWith(returned));
    expect(apiMocks[method]).toHaveBeenCalledWith(42, expect.any(AbortSignal));
  });

  it.each([
    [
      "APPROVED",
      "deactivate",
      "Ngừng hiển thị",
      backendError(409, "CONCURRENT_MODIFICATION"),
      "Trạng thái tin đã thay đổi"
    ],
    [
      "INACTIVE",
      "reactivate",
      "Kích hoạt lại",
      backendError(409, "CONCURRENT_MODIFICATION"),
      "Trạng thái tin đã thay đổi"
    ],
    [
      "APPROVED",
      "deactivate",
      "Ngừng hiển thị",
      new ApiError({ status: null, code: "NETWORK_ERROR", message: "private", category: "network" }),
      "Không thể xác nhận trạng thái mới"
    ],
    [
      "INACTIVE",
      "reactivate",
      "Kích hoạt lại",
      new ApiError({ status: null, code: "NETWORK_ERROR", message: "private", category: "network" }),
      "Không thể xác nhận trạng thái mới"
    ]
  ] as const)("keeps %s server-authoritative after %s failure", async (status, method, label, error, message) => {
    apiMocks[method].mockRejectedValue(error);
    renderActions(status);
    fireEvent.click(screen.getByRole("button", { name: label }));
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(apiMocks[method]).toHaveBeenCalledOnce();
    expect(onDetailChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Tải lại tin" }));
    expect(onRefresh).toHaveBeenCalledOnce();
  });

  it("uses inline delete confirmation, supports cancel, and redirects only after 204", async () => {
    const deletion = deferred<void>();
    apiMocks.deleteOwned.mockReturnValue(deletion.promise);
    renderActions("DRAFT");
    fireEvent.click(screen.getByRole("button", { name: "Xóa tin" }));
    expect(screen.getByText("Xóa vĩnh viễn tin này?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Hủy" }));
    expect(apiMocks.deleteOwned).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Xóa tin" }));
    fireEvent.click(screen.getByRole("button", { name: "Xác nhận xóa" }));
    expect(routerMocks.replace).not.toHaveBeenCalled();
    expect(apiMocks.deleteOwned).toHaveBeenCalledWith(42, expect.any(AbortSignal));
    await act(async () => deletion.resolve());
    expect(routerMocks.replace).toHaveBeenCalledWith("/landlord");
  });

  it("keeps a moderated DRAFT stable after LISTING_DELETE_NOT_ALLOWED", async () => {
    apiMocks.deleteOwned.mockRejectedValue(backendError(409, "LISTING_DELETE_NOT_ALLOWED"));
    renderActions("DRAFT");
    fireEvent.click(screen.getByRole("button", { name: "Xóa tin" }));
    fireEvent.click(screen.getByRole("button", { name: "Xác nhận xóa" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("đã có lịch sử kiểm duyệt hoặc không còn đủ điều kiện");
    expect(routerMocks.replace).not.toHaveBeenCalled();
    expect(screen.getByText("Xóa vĩnh viễn tin này?")).toBeInTheDocument();
  });

  it.each([
    [404, "không tồn tại hoặc bạn không thể truy cập", false],
    [401, "Phiên đăng nhập không còn hợp lệ", true],
    [403, "Bạn không có quyền thực hiện tác vụ", false],
    [422, "Không thể hoàn tất tác vụ", false]
  ] as const)("handles delete %s safely without redirect or replay", async (status, message, shouldRefresh) => {
    apiMocks.deleteOwned.mockRejectedValue(backendError(status));
    renderActions("DRAFT");
    fireEvent.click(screen.getByRole("button", { name: "Xóa tin" }));
    fireEvent.click(screen.getByRole("button", { name: "Xác nhận xóa" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(apiMocks.deleteOwned).toHaveBeenCalledOnce();
    expect(routerMocks.replace).not.toHaveBeenCalled();
    expect(refresh).toHaveBeenCalledTimes(shouldRefresh ? 1 : 0);
  });

  it("keeps deletion outcome ambiguous after a network failure", async () => {
    apiMocks.deleteOwned.mockRejectedValue(
      new ApiError({ status: null, code: "NETWORK_ERROR", message: "private", category: "network" })
    );
    renderActions("DRAFT");
    fireEvent.click(screen.getByRole("button", { name: "Xóa tin" }));
    fireEvent.click(screen.getByRole("button", { name: "Xác nhận xóa" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Không thể xác nhận tin đã được xóa");
    expect(routerMocks.replace).not.toHaveBeenCalled();
    expect(apiMocks.deleteOwned).toHaveBeenCalledOnce();
  });
});
