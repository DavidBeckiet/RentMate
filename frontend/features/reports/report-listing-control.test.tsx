import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContextValue } from "../../lib/auth/auth-provider";

const reportMock = vi.hoisted(() => vi.fn());
const useAuthMock = vi.hoisted(() => vi.fn<() => AuthContextValue>());
vi.mock("../../lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("../../lib/api/client")>("../../lib/api/client");
  return { ...actual, api: { listings: { report: reportMock } } };
});
vi.mock("../../lib/auth/auth-provider", () => ({ useAuth: useAuthMock }));

import { ReportListingControl } from "./report-listing-control";

describe("ReportListingControl", () => {
  beforeEach(() => {
    useAuthMock.mockReturnValue({
      status: "authenticated",
      user: {
        id: 7,
        role: "TENANT",
        email: "tenant@example.com",
        phone: null,
        isActive: true,
        createdAt: "2026-08-01T00:00:00.000Z",
        updatedAt: "2026-08-01T00:00:00.000Z"
      },
      error: null,
      refresh: vi.fn(),
      logout: vi.fn()
    });
    reportMock.mockResolvedValue({
      id: 1,
      listingId: 42,
      category: "FRAUD",
      status: "OPEN",
      createdAt: "2026-08-23T00:00:00.000Z"
    });
  });

  it("submits a labeled tenant report and renders a safe receipt", async () => {
    render(<ReportListingControl listingId={42} />);
    fireEvent.click(screen.getByRole("button", { name: "Báo cáo tin này" }));
    fireEvent.change(screen.getByLabelText("Lý do"), { target: { value: "FRAUD" } });
    fireEvent.change(screen.getByLabelText(/Chi tiết/), { target: { value: "Đề nghị chuyển cọc ngoài hệ thống." } });
    fireEvent.click(screen.getByRole("button", { name: "Gửi báo cáo" }));
    await waitFor(() =>
      expect(reportMock).toHaveBeenCalledWith(42, { category: "FRAUD", details: "Đề nghị chuyển cọc ngoài hệ thống." })
    );
    expect(await screen.findByRole("status")).toHaveTextContent("Báo cáo đã được gửi");
  });

  it("prompts anonymous users to sign in without exposing the form", () => {
    useAuthMock.mockReturnValue({ status: "anonymous", user: null, error: null, refresh: vi.fn(), logout: vi.fn() });
    render(<ReportListingControl listingId={42} />);
    expect(screen.getByRole("link", { name: "Đăng nhập để báo cáo tin" })).toHaveAttribute("href", "/login");
    expect(screen.queryByLabelText("Lý do")).not.toBeInTheDocument();
  });
});
