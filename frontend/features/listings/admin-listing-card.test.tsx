import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AdminListingCard } from "./admin-listing-card";
import styles from "./admin-listings-page.module.css";

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
      updatedAt: new Date().toISOString()
    };
    render(<AdminListingCard listing={listing} detailHref="/admin/listings/8?returnStatus=APPROVED&returnPage=3" />);
    const article = screen.getByRole("article", { name: "Phòng yên tĩnh" });
    expect(article).toBeInTheDocument();
    expect(article).toHaveClass(styles.rowWithoutSignals);
    expect(screen.getByText("Phòng yên tĩnh")).toBeInTheDocument();
    expect(screen.getByText("owner@example.com")).toBeInTheDocument();
    expect(screen.getByText("Quận 3")).toBeInTheDocument();
    expect(screen.getByText("Còn phòng")).toBeInTheDocument();
    expect(screen.getByText("Ngừng hoạt động")).toBeInTheDocument();
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Tín hiệu cần kiểm tra")).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("+8490");
    expect(screen.getByRole("link", { name: "Xem" })).toHaveAttribute(
      "href",
      "/admin/listings/8?returnStatus=APPROVED&returnPage=3"
    );
    expect(document.body).not.toHaveTextContent(/address|địa chỉ chính xác/i);
  });

  it("shows only safe trust warnings for open reports and possible duplicates", () => {
    render(
      <AdminListingCard
        detailHref="/admin/listings/8"
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
    expect(screen.getByRole("note")).toHaveTextContent("2 báo cáo đang mở");
    expect(screen.getByRole("note")).toHaveTextContent("khả năng trùng tiêu đề");
    expect(screen.getByRole("note")).not.toHaveTextContent(/reporter|email người báo cáo/i);
  });
});
