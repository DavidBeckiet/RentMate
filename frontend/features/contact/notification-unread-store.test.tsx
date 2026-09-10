import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const apiMocks = vi.hoisted(() => ({ getUnreadNotificationCount: vi.fn() }));

vi.mock("../../lib/api/client", () => ({
  api: { contact: { getUnreadNotificationCount: apiMocks.getUnreadNotificationCount } }
}));

import {
  decrementNotificationUnreadCount,
  incrementNotificationUnreadCount,
  setNotificationUnreadCount,
  useNotificationUnreadCount
} from "./notification-unread-store";

function Probe({ userId }: Readonly<{ userId: number }>) {
  const count = useNotificationUnreadCount(userId);
  return <output>{count === null ? "unknown" : count}</output>;
}

describe("shared notification unread state", () => {
  beforeEach(() => {
    apiMocks.getUnreadNotificationCount.mockReset();
    apiMocks.getUnreadNotificationCount.mockResolvedValue({ unreadCount: 5 });
  });

  it("hydrates once and keeps optimistic counts bounded and shared", async () => {
    render(<Probe userId={601} />);
    await waitFor(() => expect(screen.getByText("5")).toBeInTheDocument());
    expect(apiMocks.getUnreadNotificationCount).toHaveBeenCalledOnce();

    act(() => decrementNotificationUnreadCount(601));
    expect(screen.getByText("4")).toBeInTheDocument();

    act(() => setNotificationUnreadCount(601, 0));
    expect(screen.getByText("0")).toBeInTheDocument();

    act(() => incrementNotificationUnreadCount(601));
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("does not let a stale in-flight response overwrite an optimistic read", async () => {
    let resolveCount: ((value: { unreadCount: number }) => void) | undefined;
    apiMocks.getUnreadNotificationCount.mockReturnValue(
      new Promise<{ unreadCount: number }>((resolve) => {
        resolveCount = resolve;
      })
    );

    render(<Probe userId={602} />);
    await waitFor(() => expect(apiMocks.getUnreadNotificationCount).toHaveBeenCalledOnce());
    act(() => decrementNotificationUnreadCount(602));
    resolveCount?.({ unreadCount: 5 });

    await waitFor(() => expect(screen.getByText("4")).toBeInTheDocument());
  });
});
