import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import RouteError from "./error";
import RouteLoading from "./loading";
import NotFound from "./not-found";

describe("route feedback boundaries", () => {
  it("renders a consistent loading state", () => {
    render(<RouteLoading />);
    expect(screen.getByRole("status", { name: "Đang tải nội dung" })).toBeInTheDocument();
  });

  it("keeps unexpected error details private and offers recovery", () => {
    const reset = vi.fn();
    render(<RouteError error={new Error("Sensitive stack detail")} reset={reset} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Trang chưa thể hiển thị");
    expect(screen.queryByText("Sensitive stack detail")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("gives unknown routes a clear path back to marketplace search", () => {
    render(<NotFound />);
    expect(screen.getByRole("heading", { name: "Không tìm thấy trang" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Tìm phòng trên RentMate" })).toHaveAttribute("href", "/search");
  });
});
