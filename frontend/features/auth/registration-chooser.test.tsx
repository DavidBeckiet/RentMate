import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RegistrationChooser } from "./registration-chooser";

describe("RegistrationChooser", () => {
  it("offers keyboard-accessible tenant and landlord routes", () => {
    render(<RegistrationChooser />);

    const chooser = screen.getByRole("navigation", { name: "Chọn mục đích tạo tài khoản" });
    expect(chooser).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Tôi muốn tìm phòng.*Tạo tài khoản người thuê/ })).toHaveAttribute(
      "href",
      "/register/tenant"
    );
    expect(screen.getByRole("link", { name: /Tôi muốn cho thuê.*Tạo tài khoản chủ nhà/ })).toHaveAttribute(
      "href",
      "/register/landlord"
    );
    expect(screen.queryByRole("link", { name: "Đăng nhập" })).not.toBeInTheDocument();
  });
});
