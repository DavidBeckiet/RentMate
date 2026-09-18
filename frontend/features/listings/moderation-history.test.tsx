import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const apiMocks = vi.hoisted(() => ({ listHistory: vi.fn() }));
const navigation = vi.hoisted(() => ({ query: "", push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: navigation.push, replace: navigation.replace }),
  useSearchParams: () => new URLSearchParams(navigation.query)
}));
vi.mock("../../lib/api/client", async () => ({
  ...(await vi.importActual<typeof import("../../lib/api/client")>("../../lib/api/client")),
  api: { admin: apiMocks }
}));
import { ModerationHistory } from "./moderation-history";

const item = (id: number) => ({
  id,
  listingId: 7,
  adminId: id,
  previousStatus: "PENDING" as const,
  newStatus: "APPROVED" as const,
  reason: null,
  createdAt: `2026-08-0${id}T00:00:00Z`
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("ModerationHistory", () => {
  beforeEach(() => {
    apiMocks.listHistory.mockReset();
    navigation.query = "";
    navigation.push.mockReset();
    navigation.replace.mockReset();
  });

  it("uses history-specific URL state and preserves server order", async () => {
    navigation.query = "returnStatus=APPROVED&returnPage=3&historyPage=2&historyPageSize=40";
    apiMocks.listHistory.mockResolvedValue({
      data: [item(2), item(1)],
      pagination: { page: 2, pageSize: 40, hasNextPage: true }
    });
    render(<ModerationHistory listingId={7} />);
    await waitFor(() =>
      expect(apiMocks.listHistory).toHaveBeenCalledWith(7, { page: 2, pageSize: 40 }, expect.any(AbortSignal))
    );
    expect(screen.getAllByText(/Quản trị viên/).map((node) => node.textContent)).toEqual(
      expect.arrayContaining([expect.stringContaining("#2"), expect.stringContaining("#1")])
    );
    fireEvent.click(screen.getByRole("button", { name: "Trang sau" }));
    expect(navigation.push).toHaveBeenCalledWith(
      "/admin/listings/7?returnStatus=APPROVED&returnPage=3&historyPage=3&historyPageSize=40"
    );
  });

  it("rejects malformed history state locally", () => {
    navigation.query = "historyPage=1&historyPage=2";
    render(<ModerationHistory listingId={7} />);
    expect(screen.getByRole("alert")).toHaveTextContent("không hợp lệ");
    expect(apiMocks.listHistory).not.toHaveBeenCalled();
  });

  it("supports an independent explicit retry and success reset to page one", async () => {
    navigation.query = "historyPage=3";
    apiMocks.listHistory
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue({ data: [], pagination: { page: 1, pageSize: 20, hasNextPage: false } });
    const view = render(<ModerationHistory listingId={7} />);
    fireEvent.click(await screen.findByRole("button", { name: "Thử lại lịch sử" }));
    await screen.findByText("Chưa có lịch sử kiểm duyệt");
    view.rerender(<ModerationHistory listingId={7} refreshInstruction={{ token: 1, page: 1 }} />);
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith("/admin/listings/7"));
    navigation.query = "";
    view.rerender(<ModerationHistory listingId={7} refreshInstruction={{ token: 1, page: 1 }} />);
    await waitFor(() => expect(apiMocks.listHistory).toHaveBeenLastCalledWith(7, { page: 1 }, expect.any(AbortSignal)));
    expect(screen.queryByRole("navigation", { name: "Phân trang lịch sử kiểm duyệt" })).not.toBeInTheDocument();
  });

  it("resolves a canonical refresh only after the history request succeeds", async () => {
    const response = deferred<{
      data: ReturnType<typeof item>[];
      pagination: { page: number; pageSize: number; hasNextPage: boolean };
    }>();
    const resolveRefresh = vi.fn();
    apiMocks.listHistory.mockReturnValueOnce(response.promise);
    render(<ModerationHistory listingId={7} refreshInstruction={{ token: 1, resolve: resolveRefresh }} />);

    await waitFor(() => expect(apiMocks.listHistory).toHaveBeenCalledWith(7, { page: 1 }, expect.any(AbortSignal)));
    expect(resolveRefresh).not.toHaveBeenCalled();
    response.resolve({ data: [item(1)], pagination: { page: 1, pageSize: 20, hasNextPage: false } });
    await waitFor(() => expect(resolveRefresh).toHaveBeenCalledWith(true));
  });

  it("resolves a canonical refresh as failed when the history request fails", async () => {
    const resolveRefresh = vi.fn();
    apiMocks.listHistory.mockRejectedValueOnce(new Error("offline"));
    render(<ModerationHistory listingId={7} refreshInstruction={{ token: 1, resolve: resolveRefresh }} />);

    await waitFor(() => expect(resolveRefresh).toHaveBeenCalledWith(false));
    expect(screen.getByRole("alert")).toHaveTextContent("Không thể tải lịch sử kiểm duyệt.");
  });
});
