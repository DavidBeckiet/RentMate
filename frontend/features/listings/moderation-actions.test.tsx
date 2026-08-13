import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminListingDetail } from "../../types/api";

const apiMocks = vi.hoisted(() => ({ moderate: vi.fn() }));
vi.mock("../../lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("../../lib/api/client")>("../../lib/api/client");
  return { ...actual, api: { admin: apiMocks } };
});
import { ModerationActions } from "./moderation-actions";

const detail = (status: AdminListingDetail["status"] = "PENDING", active = true): AdminListingDetail => ({
  id: 7,
  status,
  title: "Tin",
  description: "Mô tả",
  monthlyRent: 5000000,
  roomAreaSqm: 20,
  addressText: "Địa chỉ",
  areaName: "Quận 1",
  latitude: 10.77,
  longitude: 106.7,
  propertyType: { code: "ROOM", label: "Phòng" },
  amenities: [],
  images: [],
  currentModerationReason: null,
  landlord: { id: 2, role: "LANDLORD", email: "owner@example.com", phone: "+8490", isActive: active },
  createdAt: "2026-08-01T00:00:00Z",
  updatedAt: "2026-08-01T00:00:00Z"
});

describe("ModerationActions", () => {
  beforeEach(() => apiMocks.moderate.mockReset());

  it("requires and trims a reason, sends exactly once, then reloads canonical reads", async () => {
    const reload = vi.fn<() => Promise<void>>().mockResolvedValue();
    const history = vi.fn();
    apiMocks.moderate.mockResolvedValue({});
    render(<ModerationActions detail={detail()} onReloadDetail={reload} onRefreshHistory={history} />);
    fireEvent.click(screen.getByRole("button", { name: "Từ chối" }));
    fireEvent.click(screen.getByRole("button", { name: "Xác nhận hành động" }));
    expect(screen.getByText("Vui lòng nhập lý do.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Lý do (bắt buộc)"), { target: { value: "  Thiếu thông tin  " } });
    fireEvent.click(screen.getByRole("button", { name: "Xác nhận hành động" }));
    fireEvent.click(screen.getByRole("button", { name: "Đang xử lý…" }));
    await waitFor(() =>
      expect(apiMocks.moderate).toHaveBeenCalledWith(7, { action: "REJECT", reason: "Thiếu thông tin" })
    );
    expect(apiMocks.moderate).toHaveBeenCalledOnce();
    await waitFor(() => expect(reload).toHaveBeenCalledOnce());
    expect(history).toHaveBeenCalledWith(true);
  });

  it("uses the frozen action matrix and validates reason length by code point", () => {
    const view = render(
      <ModerationActions
        detail={detail("HIDDEN")}
        onReloadDetail={vi.fn().mockResolvedValue(undefined)}
        onRefreshHistory={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: "Khôi phục" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Duyệt tin" })).not.toBeInTheDocument();
    view.rerender(
      <ModerationActions
        detail={detail("APPROVED")}
        onReloadDetail={vi.fn().mockResolvedValue(undefined)}
        onRefreshHistory={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Ẩn tin" }));
    fireEvent.change(screen.getByLabelText("Lý do (bắt buộc)"), { target: { value: "😀".repeat(1001) } });
    fireEvent.click(screen.getByRole("button", { name: "Xác nhận hành động" }));
    expect(screen.getByText("Lý do không được vượt quá 1000 ký tự.")).toBeInTheDocument();
    expect(apiMocks.moderate).not.toHaveBeenCalled();
  });

  it("explains that approval remains non-public for an inactive landlord", async () => {
    apiMocks.moderate.mockResolvedValue({});
    render(
      <ModerationActions
        detail={detail("PENDING", false)}
        onReloadDetail={vi.fn().mockResolvedValue(undefined)}
        onRefreshHistory={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Duyệt tin" }));
    fireEvent.click(screen.getByRole("button", { name: "Xác nhận hành động" }));
    expect(await screen.findByText(/chưa xuất hiện công khai/)).toBeInTheDocument();
  });
});
