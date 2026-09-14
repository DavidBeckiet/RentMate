import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContextValue } from "../../lib/auth/auth-provider";
import type { PublicListingDetail } from "../../types/api";

const apiMocks = vi.hoisted(() => ({ getPublicDetail: vi.fn(), listNotes: vi.fn() }));
const useAuthMock = vi.hoisted(() => vi.fn<() => AuthContextValue>());
vi.mock("../../lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("../../lib/api/client")>("../../lib/api/client");
  return {
    ...actual,
    api: {
      listings: { getPublicDetail: apiMocks.getPublicDetail },
      listingNotes: { list: apiMocks.listNotes }
    }
  };
});
vi.mock("../../lib/auth/auth-provider", () => ({ useAuth: useAuthMock }));
vi.mock("next/image", () => ({ default: ({ alt }: { alt: string }) => <span role="img" aria-label={alt} /> }));
vi.mock("./listing-note-editor", () => ({
  ListingNoteEditor: ({ listingId }: { listingId: number }) => <div>ghi-chú:{listingId}</div>
}));
vi.mock("./share-listing-control", () => ({
  ShareListingControl: ({ listingId }: { listingId: number }) => <button>chia-sẻ:{listingId}</button>
}));

vi.mock("../roommate/roommate-listing-cta", () => ({ RoommateListingCta: () => null }));

import { ComparePage } from "./compare-page";
import { useComparisonSelection } from "./comparison-store";

function selectListings(ids: readonly number[]): void {
  const { result, unmount } = renderHook(() => useComparisonSelection());
  act(() => {
    result.current.clear();
    ids.forEach((id) => result.current.toggle(id));
  });
  unmount();
}

function detail(id: number): PublicListingDetail {
  return {
    id,
    title: `Studio số ${id}`,
    description: "Phòng sáng.",
    monthlyRent: id === 41 ? 6_000_000 : 7_500_000,
    roomAreaSqm: id === 41 ? 24 : 28,
    maxOccupants: null,
    areaName: id === 41 ? "Quận 3" : "Quận 1",
    latitude: 10.77,
    longitude: 106.69,
    propertyType: { code: "STUDIO", label: "Studio" },
    amenities: [{ code: "WIFI", label: "Wi-Fi" }],
    images: [],
    landlordVerified: false,
    hasReported: false,
    businessStatus: "AVAILABLE",
    updatedAt: "2026-08-24T00:00:00.000Z"
  };
}

describe("ComparePage", () => {
  beforeEach(() => {
    selectListings([]);
    apiMocks.getPublicDetail.mockReset();
    apiMocks.listNotes.mockReset();
    apiMocks.getPublicDetail.mockImplementation(async (id: number) => detail(id));
    apiMocks.listNotes.mockResolvedValue([]);
    useAuthMock.mockReturnValue({
      status: "authenticated",
      user: {
        id: 7,
        displayName: null,
        role: "TENANT",
        email: "tenant@example.com",
        phone: null,
        isActive: true,
        createdAt: "2026-08-24T00:00:00.000Z",
        updatedAt: "2026-08-24T00:00:00.000Z"
      },
      error: null,
      refresh: vi.fn(),
      logout: vi.fn()
    });
  });

  it("loads two public listings in selection order and batches private notes", async () => {
    selectListings([42, 41]);
    render(<ComparePage />);

    expect(await screen.findByRole("heading", { name: "Studio số 42" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Studio số 41" })).toBeInTheDocument();
    expect(screen.getAllByText("Căn studio")).toHaveLength(2);
    expect(apiMocks.listNotes).toHaveBeenCalledWith([42, 41], expect.any(AbortSignal));
    expect(await screen.findByText("ghi-chú:42")).toBeInTheDocument();
    expect(screen.getByText("ghi-chú:41")).toBeInTheDocument();
  });

  it("removes a listing from the session comparison", async () => {
    selectListings([42, 41]);
    render(<ComparePage />);
    await screen.findByRole("heading", { name: "Studio số 42" });
    fireEvent.click(screen.getAllByRole("button", { name: "Bỏ khỏi so sánh" })[0]!);

    await waitFor(() =>
      expect(
        screen.getByText(
          (_content, element) =>
            element?.tagName === "P" && element.textContent?.includes("1 tin đang so sánh") === true
        )
      ).toBeInTheDocument()
    );
    expect(screen.queryByRole("heading", { name: "Studio số 42" })).not.toBeInTheDocument();
  });

  it("shows a useful empty state without making requests", () => {
    render(<ComparePage />);
    expect(screen.getByText("Chưa có tin đăng để so sánh")).toBeInTheDocument();
    expect(apiMocks.getPublicDetail).not.toHaveBeenCalled();
  });
});
