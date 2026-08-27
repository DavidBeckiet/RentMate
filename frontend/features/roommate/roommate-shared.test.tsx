import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContextValue } from "../../lib/auth/auth-provider";
import { roommateRequest } from "./test-roommate-fixtures";

const apiMocks = vi.hoisted(() => ({ blockRequest: vi.fn(), reportRequest: vi.fn() }));
const useAuthMock = vi.hoisted(() => vi.fn<() => AuthContextValue>());
const navigationMocks = vi.hoisted(() => ({ pathname: vi.fn(() => "/roommates") }));

vi.mock("next/navigation", () => ({ usePathname: navigationMocks.pathname }));
vi.mock("../../lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("../../lib/api/client")>("../../lib/api/client");
  return { ...actual, api: { roommates: apiMocks } };
});
vi.mock("../../lib/auth/auth-provider", () => ({ useAuth: useAuthMock }));

import {
  RoommateBlockControl,
  RoommateListingContext,
  RoommateReportControl,
  RoommateSubnav,
  RoommateTenantBoundary
} from "./roommate-shared";

const tenantUser = {
  id: 17,
  displayName: null,
  role: "TENANT" as const,
  email: "tenant@example.com",
  phone: null,
  isActive: true,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z"
};

function authenticatedAuthValue(): AuthContextValue {
  return {
    status: "authenticated",
    user: tenantUser,
    error: null,
    refresh: vi.fn(async () => {}),
    logout: vi.fn(async () => {})
  };
}

function anonymousAuthValue(): AuthContextValue {
  return {
    status: "anonymous",
    user: null,
    error: null,
    refresh: vi.fn(async () => {}),
    logout: vi.fn(async () => {})
  };
}

describe("roommate safety controls", () => {
  beforeEach(() => {
    apiMocks.blockRequest.mockReset();
    apiMocks.reportRequest.mockReset();
    useAuthMock.mockReturnValue(authenticatedAuthValue());
    navigationMocks.pathname.mockReturnValue("/roommates");
  });

  it("keeps protected roommate content behind a loading shell during server render", () => {
    const html = renderToString(
      <RoommateTenantBoundary>
        <p>Private roommate content</p>
      </RoommateTenantBoundary>
    );

    expect(html).toContain('role="status"');
    expect(html).not.toContain("Private roommate content");
  });

  it("reveals authenticated roommate content after the client hydration gate", async () => {
    render(
      <RoommateTenantBoundary>
        <p>Private roommate content</p>
      </RoommateTenantBoundary>
    );

    expect(await screen.findByText("Private roommate content")).toBeInTheDocument();
  });

  it("keeps the anonymous roommate result behind the loading shell until auth bootstrap completes", async () => {
    useAuthMock.mockReturnValue(anonymousAuthValue());
    const html = renderToString(
      <RoommateTenantBoundary>
        <p>Private roommate content</p>
      </RoommateTenantBoundary>
    );

    expect(html).toContain('role="status"');
    expect(html).not.toContain("Private roommate content");

    render(<RoommateTenantBoundary>Private roommate content</RoommateTenantBoundary>);
    expect(await screen.findByRole("link", { name: "Đăng nhập" })).toHaveAttribute("href", "/login");
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

  it("marks the current Roommate navigation destination for assistive technology", () => {
    navigationMocks.pathname.mockReturnValue("/roommates/conversations/91");
    render(<RoommateSubnav />);

    expect(screen.getByRole("link", { name: "Lời quan tâm" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Khám phá" })).not.toHaveAttribute("aria-current");
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
