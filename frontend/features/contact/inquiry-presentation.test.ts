import { describe, expect, it } from "vitest";
import { getInquirySenderLabel, getInquiryStatusLabel } from "./inquiry-presentation";

describe("inquiry presentation", () => {
  it("uses audience-aware status copy without unread semantics", () => {
    expect(getInquiryStatusLabel("NEW", "TENANT")).toBe("Đã gửi");
    expect(getInquiryStatusLabel("NEW", "LANDLORD")).toBe("Chờ phản hồi");
    expect(getInquiryStatusLabel("CONTACTED", "TENANT")).toBe("Đang trao đổi");
    expect(getInquiryStatusLabel("CLOSED", "LANDLORD")).toBe("Đã đóng");
  });

  it("labels the current user's messages as Bạn", () => {
    expect(getInquirySenderLabel("TENANT", "TENANT")).toBe("Bạn");
    expect(getInquirySenderLabel("LANDLORD", "TENANT")).toBe("Chủ trọ");
    expect(getInquirySenderLabel("LANDLORD", "LANDLORD")).toBe("Bạn");
    expect(getInquirySenderLabel("TENANT", "LANDLORD")).toBe("Người thuê");
  });
});
