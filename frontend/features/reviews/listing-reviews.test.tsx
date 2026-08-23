import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const apiMocks = vi.hoisted(() => ({ listReviews: vi.fn() }));
vi.mock("../../lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("../../lib/api/client")>("../../lib/api/client");
  return { ...actual, api: { listings: apiMocks } };
});

import { ListingReviews } from "./listing-reviews";

describe("ListingReviews", () => {
  beforeEach(() => {
    apiMocks.listReviews.mockResolvedValue({
      data: [
        {
          id: 9,
          overallRating: 5,
          accuracyRating: 4,
          responsivenessRating: 5,
          comment: "Thông tin đúng thực tế và chủ trọ phản hồi nhanh.",
          createdAt: "2026-08-23T00:00:00.000Z",
          verifiedInteraction: true
        }
      ],
      pagination: { page: 1, pageSize: 10, hasNextPage: false }
    });
  });

  it("renders only public review fields with a verified interaction signal", async () => {
    render(<ListingReviews listingId={42} />);
    expect(await screen.findByText("Tương tác đã xác minh")).toBeInTheDocument();
    expect(screen.getByText("Thông tin đúng thực tế và chủ trọ phản hồi nhanh.")).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/tenantId|moderationNote|reviewedByAdminId/i);
    expect(apiMocks.listReviews).toHaveBeenCalledWith(42, { page: 1, pageSize: 10 }, expect.any(AbortSignal));
  });
});
