import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { OwnerListingSummary } from "../../types/api";

vi.mock("next/image", () => ({
  default: ({ alt }: { readonly alt: string }) => <span role="img" aria-label={alt} />
}));

import { OwnerListingCard } from "./owner-listing-card";

function listing(overrides: Partial<OwnerListingSummary> = {}): OwnerListingSummary {
  return {
    id: 42,
    status: "DRAFT",
    businessStatus: "UNKNOWN",
    title: "Studio trung tâm",
    monthlyRent: 7_500_000,
    maxOccupants: null,
    areaName: "Quận 1",
    availabilityStatus: "NOT_APPLICABLE",
    availabilityConfirmedAt: null,
    availabilityExpiresAt: null,
    propertyType: { code: "STUDIO", label: "Studio" },
    coverImage: {
      id: 9,
      url: "https://res.cloudinary.com/rentmate/image/upload/room.webp",
      altText: null,
      displayOrder: 1,
      format: "webp",
      width: 1200,
      height: 900,
      byteSize: 123_456,
      createdAt: "2026-08-01T00:00:00.000Z"
    },
    currentModerationReason: null,
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...overrides
  };
}

describe("OwnerListingCard", () => {
  it("presents a rental property with its photo, identity, rent and separate lifecycle states", () => {
    render(<OwnerListingCard listing={listing({ status: "APPROVED", businessStatus: "AVAILABLE" })} />);

    expect(screen.getByRole("link", { name: "Mở tin đăng: Studio trung tâm" })).toHaveAttribute(
      "href",
      "/landlord/listings/42"
    );
    expect(screen.getByRole("img", { name: "Ảnh của Studio trung tâm" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Studio trung tâm" })).toBeInTheDocument();
    expect(screen.getByText("Quận 1")).toBeInTheDocument();
    expect(screen.getByText("7.500.000 ₫/tháng")).toBeInTheDocument();
    expect(screen.getByText("Đã duyệt")).toBeInTheDocument();
    expect(screen.getByText(/Trạng thái còn phòng/)).toBeInTheDocument();
    expect(screen.getByText("Còn phòng")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Chi tiết" })).toHaveAttribute("href", "/landlord/listings/42");
    expect(document.body).not.toHaveTextContent(/landlordContact|addressText|latitude|longitude|provider/i);
  });

  it("renders nullable fallbacks and a meaningful image placeholder", () => {
    render(
      <OwnerListingCard
        listing={listing({ title: null, monthlyRent: null, areaName: null, propertyType: null, coverImage: null })}
      />
    );

    expect(screen.getByRole("heading", { name: "Tin đăng chưa có tiêu đề" })).toBeInTheDocument();
    expect(screen.getByText("Chưa nhập giá")).toBeInTheDocument();
    expect(screen.getByText("Chưa xác định")).toBeInTheDocument();
    expect(screen.getByText("Chưa nhập khu vực")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Chưa có ảnh cho Tin đăng chưa có tiêu đề" })).toBeInTheDocument();
  });

  it("shows the rejection reason and a correction-oriented primary action", () => {
    render(<OwnerListingCard listing={listing({ status: "REJECTED", currentModerationReason: "Cần điều chỉnh" })} />);

    expect(screen.getByText("Cần điều chỉnh")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Sửa tin/ })).toHaveAttribute("href", "/landlord/listings/42");
  });

  it.each(["DRAFT", "PENDING", "APPROVED", "INACTIVE"] as const)("does not show stale reason for %s", (status) => {
    render(<OwnerListingCard listing={listing({ status, currentModerationReason: "Lý do cũ" })} />);
    expect(screen.queryByText("Lý do cũ")).not.toBeInTheDocument();
  });

  it("keeps secondary actions out of the card and focuses the quick inspection action", () => {
    const onInspect = vi.fn();
    render(<OwnerListingCard listing={listing()} onInspect={onInspect} />);

    expect(screen.queryByRole("combobox", { name: "Tình trạng phòng cho Studio trung tâm" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Nhân bản/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Xem chi tiết chỗ ở: Studio trung tâm" }));
    expect(onInspect).toHaveBeenCalledOnce();
    expect(screen.getByRole("link", { name: "Studio trung tâm" })).toHaveAttribute("href", "/landlord/listings/42");
    const editLink = screen.getByRole("link", { name: "Chỉnh sửa" });
    expect(editLink).toHaveAttribute("href", "/landlord/listings/42");
    editLink.addEventListener("click", (event) => event.preventDefault(), { once: true });
    fireEvent.click(editLink);
    expect(onInspect).toHaveBeenCalledOnce();
  });

  it("opens the quick inspection trigger without replacing the existing detail route", () => {
    const onInspect = vi.fn();
    render(<OwnerListingCard listing={listing({ status: "APPROVED" })} onInspect={onInspect} />);

    fireEvent.click(screen.getByRole("button", { name: "Xem chi tiết chỗ ở: Studio trung tâm" }));

    expect(onInspect).toHaveBeenCalledOnce();
    expect(screen.getByRole("link", { name: "Chỉnh sửa" })).toHaveAttribute("href", "/landlord/listings/42");
  });
});
