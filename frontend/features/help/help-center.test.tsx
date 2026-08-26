import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HelpCenter } from "./help-center";

describe("HelpCenter", () => {
  it("renders FAQ groups and the safety checklist", () => {
    render(<HelpCenter />);

    expect(screen.getByRole("heading", { name: "Tìm câu trả lời, thuê phòng an toàn hơn." })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Giải đáp nhanh" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Checklist trước khi thuê" })).toBeInTheDocument();
    expect(screen.getByText(/Không chuyển tiền đặt cọc/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Tìm phòng" })).toHaveAttribute("href", "/search");
    expect(screen.getByRole("link", { name: "Đã xem" })).toHaveAttribute("href", "/recently-viewed");
    expect(document.querySelectorAll("details")).toHaveLength(7);
  });

  it("keeps support request entry point anchored for the next help workflow", () => {
    render(<HelpCenter />);

    expect(screen.getByRole("link", { name: "Gửi yêu cầu hỗ trợ" })).toHaveAttribute("href", "#support-request");
    expect(screen.getByText("Không gửi mật khẩu, mã OTP, giấy tờ nhạy cảm hoặc thông tin ngân hàng qua cuộc trò chuyện.")).toBeInTheDocument();
  });
});
