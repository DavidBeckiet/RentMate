import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NotificationUnreadBadge, notificationAccessibleLabel } from "./notification-unread-badge";

describe("NotificationUnreadBadge", () => {
  it.each([
    [1, "1"],
    [99, "99"],
    [100, "99+"]
  ])("renders %s as %s", (count, visualCount) => {
    render(<NotificationUnreadBadge unreadCount={count} />);
    expect(screen.getByText(visualCount)).toBeInTheDocument();
  });

  it.each([null, 0])("hides the badge for %s", (count) => {
    render(<NotificationUnreadBadge unreadCount={count} />);
    expect(screen.queryByText(/\d/)).not.toBeInTheDocument();
  });

  it("keeps the full count in the accessible label", () => {
    expect(notificationAccessibleLabel(100)).toBe("Thông báo, 100 chưa đọc");
  });
});
