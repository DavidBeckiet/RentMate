import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AdminListingCard } from "./admin-listing-card";

describe("AdminListingCard", () => {
  it("shows queue-safe summary data and a detail link without exact address", () => {
    const listing = {
      id: 8,
      status: "PENDING" as const,
      businessStatus: "AVAILABLE" as const,
      title: "Phòng yên tĩnh",
      areaName: "Quận 3",
      landlord: { id: 2, email: "owner@example.com", phone: "+8490", isActive: false },
      openReportCount: 0,
      possibleDuplicate: false,
      updatedAt: "2026-08-01T00:00:00.000Z"
    };
    render(<AdminListingCard listing={listing} />);
    expect(screen.getByText("Phòng yên tĩnh")).toBeInTheDocument();
    expect(screen.getByText("owner@example.com")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Xem chi tiết" })).toHaveAttribute("href", "/admin/listings/8");
    expect(document.body).not.toHaveTextContent(/address|địa chỉ chính xác/i);
  });

  it("shows only safe trust warnings for open reports and possible duplicates", () => {
    render(
      <AdminListingCard
        listing={{
          id: 8,
          status: "PENDING",
          businessStatus: "AVAILABLE",
          title: "Phòng cần kiểm tra",
          areaName: "Quận 3",
          landlord: { id: 2, email: "owner@example.com", phone: "+8490", isActive: false },
          openReportCount: 2,
          possibleDuplicate: true,
          updatedAt: new Date().toISOString()
        }}
      />
    );
    expect(screen.getByRole("note")).toHaveTextContent("2 báo cáo đang chờ xử lý");
    expect(screen.getByRole("note")).toHaveTextContent("khả năng trùng lặp");
    expect(screen.getByRole("note")).not.toHaveTextContent(/reporter|email người báo cáo/i);
  });
});
