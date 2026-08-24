import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RegistrationChooser } from "./registration-chooser";

describe("RegistrationChooser", () => {
  it("offers keyboard-accessible tenant and landlord routes", () => {
    render(<RegistrationChooser />);

    const chooser = screen.getByRole("navigation", { name: "Chọn mục đích tạo tài khoản" });
    expect(chooser).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Tôi muốn tìm phòng/ })).toHaveAttribute("href", "/register/tenant");
    expect(screen.getByRole("link", { name: /Tôi muốn cho thuê/ })).toHaveAttribute("href", "/register/landlord");
    expect(screen.getByRole("link", { name: "Đăng nhập" })).toHaveAttribute("href", "/login");
  });
});
