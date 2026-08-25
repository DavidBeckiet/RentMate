import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { OwnerListingSummary } from "../../types/api";

vi.mock("next/image", () => ({
  default: ({ alt }: { alt: string }) => <span role="img" aria-label={alt} />
}));

import { OwnerListingCard } from "./owner-listing-card";

function listing(overrides: Partial<OwnerListingSummary> = {}): OwnerListingSummary {
  return {
    id: 42,
    status: "DRAFT",
    title: "Studio trung tâm",
    monthlyRent: 7_500_000,
    maxOccupants: null,
    areaName: "Quận 1",
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
    ...overrides,
    businessStatus: overrides.businessStatus ?? "UNKNOWN"
  };
}

describe("OwnerListingCard", () => {
  it("links to the owner route and renders owner status without private/contact leakage", () => {
    render(<OwnerListingCard listing={listing()} />);
    expect(screen.getByRole("link", { name: /Studio trung tâm/ })).toHaveAttribute("href", "/landlord/listings/42");
    expect(screen.getByText("Nháp")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Ảnh của Studio trung tâm" })).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/landlordContact|addressText|latitude|longitude|provider/i);
  });

  it("renders all nullable fallbacks and the restrained image placeholder", () => {
    render(
      <OwnerListingCard
        listing={listing({ title: null, monthlyRent: null, areaName: null, propertyType: null, coverImage: null })}
      />
    );
    expect(screen.getByRole("heading", { name: "Chưa có tiêu đề" })).toBeInTheDocument();
    expect(screen.getByText("Chưa nhập giá")).toBeInTheDocument();
    expect(screen.getByText(/Chưa chọn loại/)).toHaveTextContent("Chưa nhập khu vực");
    expect(screen.getByRole("img", { name: "Chưa có ảnh cho Chưa có tiêu đề" })).toBeInTheDocument();
  });

  it.each([
    ["REJECTED", "Lý do từ chối"],
    ["HIDDEN", "Lý do ẩn"]
  ] as const)("shows current moderation reason for %s", (status, label) => {
    render(<OwnerListingCard listing={listing({ status, currentModerationReason: "Cần điều chỉnh" })} />);
    expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.getByText("Cần điều chỉnh")).toBeInTheDocument();
  });

  it.each(["DRAFT", "PENDING", "APPROVED", "INACTIVE"] as const)("does not show stale reason for %s", (status) => {
    render(<OwnerListingCard listing={listing({ status, currentModerationReason: "Lý do cũ" })} />);
    expect(screen.queryByText("Lý do cũ")).not.toBeInTheDocument();
  });
});
