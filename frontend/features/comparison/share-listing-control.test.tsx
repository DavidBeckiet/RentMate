import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ShareListingControl } from "./share-listing-control";

describe("ShareListingControl", () => {
  afterEach(() => vi.restoreAllMocks());

  it("copies the canonical public listing URL when native share is unavailable", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    render(<ShareListingControl listingId={42} title="Studio sáng" />);

    fireEvent.click(screen.getByRole("button", { name: "Chia sẻ" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("http://localhost:3000/listings/42"));
    expect(screen.getByText("Đã sao chép đường dẫn tin đăng.")).toBeInTheDocument();
  });

  it("uses the native share sheet when supported", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { configurable: true, value: share });
    render(<ShareListingControl listingId={42} title="Studio sáng" />);
    fireEvent.click(screen.getByRole("button", { name: "Chia sẻ" }));

    await waitFor(() =>
      expect(share).toHaveBeenCalledWith({
        title: "Studio sáng",
        text: "Xem tin Studio sáng trên RentMate",
        url: "http://localhost:3000/listings/42"
      })
    );
  });
});
