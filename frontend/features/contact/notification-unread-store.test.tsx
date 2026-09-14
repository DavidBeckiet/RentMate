import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  NotificationRealtimeConnectionStatus,
  NotificationRealtimeEvent
} from "../../lib/api/notification-realtime";
import type { Notification } from "../../types/api";

const apiMocks = vi.hoisted(() => ({ getUnreadNotificationCount: vi.fn() }));
const realtimeMocks = vi.hoisted(() => ({
  handlers: null as null | {
    onEvent: (event: NotificationRealtimeEvent) => void;
    onStatusChange: (status: NotificationRealtimeConnectionStatus) => void;
  },
  close: vi.fn()
}));

vi.mock("../../lib/api/client", () => ({
  api: { contact: { getUnreadNotificationCount: apiMocks.getUnreadNotificationCount } }
}));
vi.mock("../../lib/api/notification-realtime", () => ({
  connectNotificationRealtime: (_userId: number, handlers: typeof realtimeMocks.handlers & {}) => {
    realtimeMocks.handlers = handlers;
    return { close: realtimeMocks.close };
  }
}));

import {
  decrementNotificationUnreadCount,
  incrementNotificationUnreadCount,
  setNotificationUnreadCount,
  useNotificationRealtime,
  useNotificationUnreadCount
} from "./notification-unread-store";

function Probe({ userId }: Readonly<{ userId: number }>) {
  const count = useNotificationUnreadCount(userId);
  return <output>{count === null ? "unknown" : count}</output>;
}

function RealtimeProbe({ userId }: Readonly<{ userId: number }>) {
  const snapshot = useNotificationRealtime(userId);
  const count = useNotificationUnreadCount(userId);
  return (
    <>
      <output data-testid="realtime-version">{snapshot.latestNotificationVersion}</output>
      <output data-testid="realtime-notification-id">{snapshot.latestNotification?.id ?? "none"}</output>
      <output data-testid="realtime-unread-count">{count === null ? "unknown" : count}</output>
    </>
  );
}

function roommateMessageNotification(createdAt: string): Notification {
  return {
    id: 801,
    eventType: "ROOMMATE_MESSAGE_RECEIVED",
    inquiryId: null,
    listingId: null,
    roommateRequestId: 701,
    roommateInterestId: 601,
    resourcePath: "/roommate-interests/601",
    isRead: false,
    createdAt
  };
}

describe("shared notification unread state", () => {
  beforeEach(() => {
    apiMocks.getUnreadNotificationCount.mockReset();
    apiMocks.getUnreadNotificationCount.mockResolvedValue({ unreadCount: 5 });
    realtimeMocks.handlers = null;
    realtimeMocks.close.mockReset();
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

  it("publishes later Roommate messages that update the same notification row without double-counting it", async () => {
    apiMocks.getUnreadNotificationCount.mockResolvedValue({ unreadCount: 1 });
    const view = render(<RealtimeProbe userId={603} />);
    await waitFor(() => expect(screen.getByTestId("realtime-unread-count")).toHaveTextContent("1"));

    act(() => {
      realtimeMocks.handlers?.onEvent({
        type: "NOTIFICATION_CREATED",
        notification: roommateMessageNotification("2026-09-01T12:00:00.000Z")
      });
    });
    await waitFor(() => expect(screen.getByTestId("realtime-version")).toHaveTextContent("1"));

    act(() => {
      realtimeMocks.handlers?.onEvent({
        type: "NOTIFICATION_CREATED",
        notification: roommateMessageNotification("2026-09-01T12:00:01.000Z")
      });
    });

    await waitFor(() => expect(screen.getByTestId("realtime-version")).toHaveTextContent("2"));
    expect(screen.getByTestId("realtime-notification-id")).toHaveTextContent("801");
    expect(screen.getByTestId("realtime-unread-count")).toHaveTextContent("1");
    expect(apiMocks.getUnreadNotificationCount).toHaveBeenCalledTimes(3);

    view.unmount();
    expect(realtimeMocks.close).toHaveBeenCalledOnce();
  });
});
