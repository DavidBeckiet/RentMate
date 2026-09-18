import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminListingDetail } from "../../types/api";

const apiMocks = vi.hoisted(() => ({ moderate: vi.fn() }));
vi.mock("../../lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("../../lib/api/client")>("../../lib/api/client");
  return { ...actual, api: { admin: apiMocks } };
});
import { ApiError } from "../../lib/api/transport";
import { ModerationActions } from "./moderation-actions";

const detail = (status: AdminListingDetail["status"] = "PENDING", active = true): AdminListingDetail => ({
  id: 7,
  status,
  businessStatus: "AVAILABLE",
  title: "Tin",
  description: "Mô tả",
  monthlyRent: 5000000,
  roomAreaSqm: 20,
  maxOccupants: null,
  addressText: "Địa chỉ",
  areaName: "Quận 1",
  latitude: 10.77,
  longitude: 106.7,
  availabilityStatus: "NOT_APPLICABLE",
  availabilityConfirmedAt: null,
  availabilityExpiresAt: null,
  propertyType: { code: "ROOM", label: "Phòng" },
  amenities: [],
  images: [],
  currentModerationReason: null,
  landlord: { id: 2, role: "LANDLORD", email: "owner@example.com", phone: "+8490", isActive: active },
  openReportCount: 0,
  possibleDuplicate: false,
  createdAt: "2026-08-01T00:00:00Z",
  updatedAt: "2026-08-01T00:00:00Z"
});

function typeText(field: HTMLTextAreaElement, text: string) {
  field.focus();
  for (const character of text) {
    fireEvent.keyDown(field, { key: character });
    fireEvent.input(field, { target: { value: `${field.value}${character}` } });
    fireEvent.keyUp(field, { key: character });
    expect(document.activeElement).toBe(field);
  }
}

describe("ModerationActions", () => {
  beforeEach(() => apiMocks.moderate.mockReset());

  it("requires and trims a reason, keeps focus while typing, sends exactly once, then reloads canonical reads", async () => {
    const canonical = vi.fn<(_: boolean) => Promise<boolean>>().mockResolvedValue(true);
    apiMocks.moderate.mockResolvedValue({});
    render(<ModerationActions detail={detail()} onReloadCanonical={canonical} />);
    fireEvent.click(screen.getByRole("button", { name: "Từ chối" }));
    const dialog = await screen.findByRole("dialog", { name: "Từ chối tin này?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Từ chối tin" }));
    expect(within(dialog).getByText("Vui lòng nhập lý do.")).toBeInTheDocument();
    const reasonInput = within(dialog).getByLabelText("Lý do (bắt buộc)") as HTMLTextAreaElement;
    typeText(reasonInput, "Thiếu thông tin");
    expect(reasonInput).toHaveValue("Thiếu thông tin");
    fireEvent.click(within(dialog).getByRole("button", { name: "Từ chối tin" }));
    await waitFor(() =>
      expect(apiMocks.moderate).toHaveBeenCalledWith(7, { action: "REJECT", reason: "Thiếu thông tin" })
    );
    expect(apiMocks.moderate).toHaveBeenCalledOnce();
    await waitFor(() => expect(canonical).toHaveBeenCalledWith(true));
  });

  it("uses the frozen action matrix and validates reason length by code point", async () => {
    const canonical = vi.fn<(_: boolean) => Promise<boolean>>().mockResolvedValue(true);
    const view = render(<ModerationActions detail={detail("HIDDEN")} onReloadCanonical={canonical} />);
    expect(screen.getByRole("button", { name: "Khôi phục" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Duyệt tin" })).not.toBeInTheDocument();
    view.rerender(<ModerationActions detail={detail("APPROVED")} onReloadCanonical={canonical} />);
    fireEvent.click(screen.getByRole("button", { name: "Ẩn tin" }));
    const dialog = await screen.findByRole("dialog", { name: "Ẩn tin này?" });
    const reasonInput = within(dialog).getByLabelText("Lý do (bắt buộc)") as HTMLTextAreaElement;
    typeText(reasonInput, "Lý do ẩn tin");
    expect(reasonInput).toHaveValue("Lý do ẩn tin");
    fireEvent.input(reasonInput, { target: { value: "😀".repeat(1001) } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Ẩn tin" }));
    expect(within(dialog).getByText("Lý do không được vượt quá 1000 ký tự.")).toBeInTheDocument();
    expect(apiMocks.moderate).not.toHaveBeenCalled();
  });

  it("requires a confirmation for hide and sends the entered reason", async () => {
    const canonical = vi.fn<(_: boolean) => Promise<boolean>>().mockResolvedValue(true);
    apiMocks.moderate.mockResolvedValue({});
    render(<ModerationActions detail={detail("APPROVED")} onReloadCanonical={canonical} />);
    fireEvent.click(screen.getByRole("button", { name: "Ẩn tin" }));
    const dialog = await screen.findByRole("dialog", { name: "Ẩn tin này?" });
    const reasonInput = within(dialog).getByLabelText("Lý do (bắt buộc)") as HTMLTextAreaElement;
    typeText(reasonInput, "Vi phạm nội dung");
    fireEvent.click(within(dialog).getByRole("button", { name: "Ẩn tin" }));
    await waitFor(() =>
      expect(apiMocks.moderate).toHaveBeenCalledWith(7, { action: "HIDE", reason: "Vi phạm nội dung" })
    );
    await waitFor(() => expect(canonical).toHaveBeenCalledWith(true));
  });

  it("confirms restore without asking for a reason", async () => {
    const canonical = vi.fn<(_: boolean) => Promise<boolean>>().mockResolvedValue(true);
    apiMocks.moderate.mockResolvedValue({});
    render(<ModerationActions detail={detail("HIDDEN")} onReloadCanonical={canonical} />);
    fireEvent.click(screen.getByRole("button", { name: "Khôi phục" }));
    const dialog = await screen.findByRole("dialog", { name: "Khôi phục tin này?" });
    expect(within(dialog).getByText(/chỉ có thể hiển thị công khai/)).toBeInTheDocument();
    expect(within(dialog).queryByLabelText(/Lý do/)).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Khôi phục tin" }));
    await waitFor(() => expect(apiMocks.moderate).toHaveBeenCalledWith(7, { action: "RESTORE" }));
    await waitFor(() => expect(canonical).toHaveBeenCalledWith(true));
  });

  it("explains that approval remains non-public for an inactive landlord", async () => {
    const canonical = vi.fn<(_: boolean) => Promise<boolean>>().mockResolvedValue(true);
    apiMocks.moderate.mockResolvedValue({});
    render(<ModerationActions detail={detail("PENDING", false)} onReloadCanonical={canonical} />);
    fireEvent.click(screen.getByRole("button", { name: "Duyệt tin" }));
    const dialog = await screen.findByRole("dialog", { name: "Duyệt tin này?" });
    expect(within(dialog).queryByLabelText(/Lý do/)).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Duyệt tin" }));
    expect(await screen.findByText(/chưa xuất hiện công khai/)).toBeInTheDocument();
    expect(apiMocks.moderate).toHaveBeenCalledWith(7, { action: "APPROVE" });
  });

  it("keeps decisions blocked until both canonical reads finish after a conflict", async () => {
    const canonical = vi.fn<(_: boolean) => Promise<boolean>>().mockResolvedValue(false);
    apiMocks.moderate.mockImplementationOnce(async () => {
      throw new ApiError({ status: 409, code: "CONFLICT", message: "stale", category: "backend" });
    });
    render(<ModerationActions detail={detail()} onReloadCanonical={canonical} />);
    fireEvent.click(screen.getByRole("button", { name: "Duyệt tin" }));
    const dialog = await screen.findByRole("dialog", { name: "Duyệt tin này?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Duyệt tin" }));
    expect(await screen.findByText(/chưa thể tải đủ trạng thái và lịch sử/)).toBeInTheDocument();
    expect(canonical).toHaveBeenCalledWith(false);
    expect(screen.getByRole("button", { name: "Duyệt tin" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Tải lại trạng thái và lịch sử" })).toBeEnabled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(apiMocks.moderate).toHaveBeenCalledOnce();
  });

  it("does not unlock while canonical recovery is pending, then unlocks only after success", async () => {
    let resolveCanonical!: (value: boolean) => void;
    const canonicalPromise = new Promise<boolean>((resolve) => {
      resolveCanonical = resolve;
    });
    const canonical = vi.fn<(_: boolean) => Promise<boolean>>().mockReturnValue(canonicalPromise);
    apiMocks.moderate.mockImplementationOnce(async () => {
      throw new ApiError({ status: null, code: "NETWORK_ERROR", message: "offline", category: "network" });
    });
    render(<ModerationActions detail={detail()} onReloadCanonical={canonical} />);
    fireEvent.click(screen.getByRole("button", { name: "Duyệt tin" }));
    const dialog = await screen.findByRole("dialog", { name: "Duyệt tin này?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Duyệt tin" }));
    await waitFor(() => expect(canonical).toHaveBeenCalledWith(false));
    expect(screen.getByRole("button", { name: "Duyệt tin" })).toBeDisabled();
    resolveCanonical(true);
    expect(await screen.findByText(/Đã tải lại trạng thái và lịch sử mới nhất/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Duyệt tin" })).toBeEnabled();
    expect(apiMocks.moderate).toHaveBeenCalledOnce();
  });

  it("keeps the recovery lock after a failed network reload and allows a retry", async () => {
    const canonical = vi
      .fn<(_: boolean) => Promise<boolean>>()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    apiMocks.moderate.mockImplementationOnce(async () => {
      throw new ApiError({ status: null, code: "NETWORK_ERROR", message: "offline", category: "network" });
    });
    render(<ModerationActions detail={detail()} onReloadCanonical={canonical} />);
    fireEvent.click(screen.getByRole("button", { name: "Duyệt tin" }));
    const dialog = await screen.findByRole("dialog", { name: "Duyệt tin này?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Duyệt tin" }));
    expect(await screen.findByText(/Không thể tải lại trạng thái tin/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Duyệt tin" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Tải lại trạng thái và lịch sử" }));
    await waitFor(() => expect(canonical).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(/Đã tải lại trạng thái và lịch sử mới nhất/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Duyệt tin" })).toBeEnabled();
  });

  it.each(["REJECTED", "INACTIVE"] as const)("renders a concise read-only outcome for %s", (status) => {
    render(<ModerationActions detail={detail(status)} onReloadCanonical={vi.fn().mockResolvedValue(true)} />);

    const outcomeTitle = status === "REJECTED" ? "Tin bị từ chối" : "Tin đang ngừng hoạt động";
    expect(screen.getByRole("region", { name: outcomeTitle })).toHaveTextContent("Kết quả kiểm duyệt");
    expect(screen.getByRole("region", { name: outcomeTitle })).toHaveTextContent(outcomeTitle);
    expect(screen.queryByRole("button", { name: /Duyệt|Từ chối|Ẩn|Khôi phục/ })).not.toBeInTheDocument();
  });
});
