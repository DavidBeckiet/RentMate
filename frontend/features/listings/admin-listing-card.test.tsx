import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AdminListingCard } from "./admin-listing-card";

describe("AdminListingCard", () => {
  it("shows queue-safe summary data and a detail link without exact address", () => {
    const listing = {
      id: 8,
      status: "PENDING" as const,
      title: "Phòng yên tĩnh",
      areaName: "Quận 3",
      landlord: { id: 2, email: "owner@example.com", phone: "+8490", isActive: false },
      updatedAt: "2026-08-01T00:00:00.000Z"
    };
    render(<AdminListingCard listing={listing} />);
    expect(screen.getByText("Phòng yên tĩnh")).toBeInTheDocument();
    expect(screen.getByText("owner@example.com")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Xem chi tiết" })).toHaveAttribute("href", "/admin/listings/8");
    expect(document.body).not.toHaveTextContent(/address|địa chỉ chính xác/i);
  });
});
