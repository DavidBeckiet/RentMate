import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { roommateRequest } from "./test-roommate-fixtures";

const apiMocks = vi.hoisted(() => ({ blockRequest: vi.fn(), reportRequest: vi.fn() }));

vi.mock("../../lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("../../lib/api/client")>("../../lib/api/client");
  return { ...actual, api: { roommates: apiMocks } };
});

import { RoommateBlockControl, RoommateListingContext, RoommateReportControl } from "./roommate-shared";

describe("roommate safety controls", () => {
  beforeEach(() => {
    apiMocks.blockRequest.mockReset();
    apiMocks.reportRequest.mockReset();
  });

  it("requires an explicit confirmation before blocking", async () => {
    apiMocks.blockRequest.mockResolvedValue({ blocked: true });
    render(<RoommateBlockControl context="request" id={42} />);
    fireEvent.click(screen.getByRole("button", { name: "Chặn" }));
    expect(apiMocks.blockRequest).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Xác nhận chặn" }));
    await waitFor(() => expect(apiMocks.blockRequest).toHaveBeenCalledWith(42));
    expect(await screen.findByRole("status")).toHaveTextContent("Bạn đã chặn tương tác này.");
  });

  it("submits a request report with explicit target and category", async () => {
    apiMocks.reportRequest.mockResolvedValue({ id: 1, status: "OPEN" });
    render(<RoommateReportControl target="ROOMMATE_REQUEST" requestId={42} />);
    fireEvent.click(screen.getByRole("button", { name: "Báo cáo" }));
    fireEvent.change(screen.getByLabelText("Lý do"), { target: { value: "FRAUD" } });
    fireEvent.change(screen.getByLabelText(/Chi tiết/), { target: { value: "Có yêu cầu chuyển tiền trước." } });
    fireEvent.click(screen.getByRole("button", { name: "Gửi báo cáo" }));
    await waitFor(() =>
      expect(apiMocks.reportRequest).toHaveBeenCalledWith(42, {
        targetType: "ROOMMATE_REQUEST",
        category: "FRAUD",
        details: "Có yêu cầu chuyển tiền trước."
      })
    );
    expect(await screen.findByRole("status")).toHaveTextContent("Báo cáo đã được gửi tới đội ngũ an toàn.");
  });

  it("keeps an unavailable listing as historical context after a request is matched", () => {
    render(
      <RoommateListingContext
        request={roommateRequest({
          listingId: 23,
          listingMode: "LINKED",
          status: "MATCHED",
          listing: null,
          signals: { profileCompleted: true, requestOpen: false, listingCurrentlyAvailable: false }
        })}
      />
    );

    expect(
      screen.getByText("Liên kết này chỉ còn là ngữ cảnh lịch sử; kết nối ở ghép không tự động thay đổi.")
    ).toBeInTheDocument();
    expect(screen.queryByText(/gỡ liên kết hoặc hủy yêu cầu/i)).not.toBeInTheDocument();
  });
});
