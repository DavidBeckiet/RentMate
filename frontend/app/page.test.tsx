import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import HomePage from "./page";

describe("HomePage", () => {
  it("renders a bounded RentMate foundation placeholder without starting future workflows", () => {
    render(<HomePage />);

    expect(screen.getByRole("heading", { level: 1, name: /Một nền tảng rõ ràng/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Nền tảng giao diện đã sẵn sàng" })).toBeInTheDocument();
    expect(screen.getByText(/Thành phố Hồ Chí Minh/)).toBeInTheDocument();
    expect(screen.queryByRole("form")).not.toBeInTheDocument();
  });
});
