import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContextValue } from "../../lib/auth/auth-provider";
import type { ListingNote } from "../../types/api";

const apiMocks = vi.hoisted(() => ({ list: vi.fn(), save: vi.fn(), remove: vi.fn() }));
const useAuthMock = vi.hoisted(() => vi.fn<() => AuthContextValue>());
vi.mock("../../lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("../../lib/api/client")>("../../lib/api/client");
  return { ...actual, api: { listingNotes: apiMocks } };
});
vi.mock("../../lib/auth/auth-provider", () => ({ useAuth: useAuthMock }));

import { ListingNoteEditor } from "./listing-note-editor";

const note: ListingNote = {
  listingId: 42,
  note: "Gần trường, hỏi thêm tiền điện.",
  createdAt: "2026-08-24T00:00:00.000Z",
  updatedAt: "2026-08-24T00:00:00.000Z"
};

function auth(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  return {
    status: "authenticated",
    user: {
      id: 7,
      role: "TENANT",
      email: "tenant@example.com",
      phone: null,
      isActive: true,
      createdAt: note.createdAt,
      updatedAt: note.updatedAt
    },
    error: null,
    refresh: vi.fn(),
    logout: vi.fn(),
    ...overrides
  };
}

describe("ListingNoteEditor", () => {
  beforeEach(() => {
    apiMocks.list.mockReset();
    apiMocks.save.mockReset();
    apiMocks.remove.mockReset();
    apiMocks.list.mockResolvedValue([]);
    apiMocks.save.mockResolvedValue(note);
    apiMocks.remove.mockResolvedValue(undefined);
    useAuthMock.mockReturnValue(auth());
  });

  it("loads and saves a private tenant note", async () => {
    render(<ListingNoteEditor listingId={42} />);
    await waitFor(() => expect(apiMocks.list).toHaveBeenCalledWith([42], expect.any(AbortSignal)));
    fireEvent.change(screen.getByLabelText("Ghi chú riêng"), { target: { value: note.note } });
    fireEvent.click(screen.getByRole("button", { name: "Lưu ghi chú" }));

    await waitFor(() => expect(apiMocks.save).toHaveBeenCalledWith(42, note.note));
    expect(screen.getByText("Đã lưu ghi chú riêng.")).toBeInTheDocument();
    expect(screen.getByText(/Chỉ bạn nhìn thấy/)).toBeInTheDocument();
  });

  it("uses a batched initial note and deletes it without loading again", async () => {
    const onChanged = vi.fn();
    render(<ListingNoteEditor listingId={42} initialNote={note} onChanged={onChanged} />);
    expect(screen.getByLabelText("Ghi chú riêng")).toHaveValue(note.note);
    expect(apiMocks.list).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Xóa ghi chú" }));

    await waitFor(() => expect(apiMocks.remove).toHaveBeenCalledWith(42));
    expect(onChanged).toHaveBeenCalledWith(null);
  });

  it("asks an anonymous visitor to sign in without reading notes", () => {
    useAuthMock.mockReturnValue(auth({ status: "anonymous", user: null }));
    render(<ListingNoteEditor listingId={42} />);
    expect(screen.getByRole("link", { name: "Đăng nhập bằng tài khoản người thuê" })).toHaveAttribute("href", "/login");
    expect(apiMocks.list).not.toHaveBeenCalled();
  });
});
