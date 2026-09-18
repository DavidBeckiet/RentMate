import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const redirectMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("../../../features/admin-overview/admin-overview-page", () => ({
  AdminOverviewPage: () => <h1>Tổng quan quản trị</h1>
}));

import AdminDashboardRoute from "./page";

describe("AdminDashboardRoute", () => {
  it("renders the dashboard when /admin has no legacy queue parameters", async () => {
    render(await AdminDashboardRoute({ searchParams: Promise.resolve({ utm: "dashboard" }) }));
    expect(screen.getByRole("heading", { name: "Tổng quan quản trị" })).toBeInTheDocument();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("moves old listing queue URLs to the canonical queue without carrying unrelated query", async () => {
    await AdminDashboardRoute({ searchParams: Promise.resolve({ status: "APPROVED", page: "3", utm: "ignored" }) });
    expect(redirectMock).toHaveBeenCalledWith("/admin/listings?status=APPROVED&page=3");
  });
});
