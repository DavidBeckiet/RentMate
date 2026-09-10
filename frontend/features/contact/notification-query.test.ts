import { describe, expect, it } from "vitest";
import { notificationPageUrl, parseNotificationPageQuery } from "./notification-query";

describe("notification pagination query", () => {
  it.each(["", "bad", "0", "-2", "1.5", "999999999999999999999"])("normalizes invalid page %s to page 1", (value) => {
    const params = new URLSearchParams(value === "" ? "" : `page=${value}`);
    expect(parseNotificationPageQuery(params)).toEqual({ page: 1, valid: value === "" });
  });

  it("accepts positive integer pages and keeps canonical URLs compact", () => {
    expect(parseNotificationPageQuery(new URLSearchParams("page=2"))).toEqual({ page: 2, valid: true });
    expect(notificationPageUrl(1)).toBe("/notifications");
    expect(notificationPageUrl(3)).toBe("/notifications?page=3");
  });

  it("rejects duplicate page parameters safely", () => {
    expect(parseNotificationPageQuery(new URLSearchParams("page=2&page=3"))).toEqual({ page: 1, valid: false });
  });
});
