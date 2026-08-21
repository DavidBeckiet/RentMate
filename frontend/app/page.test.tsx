import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../features/listings/home-page", () => ({
  HomePageExperience: () => (
    <section>
      <h1>RentMate — Chạm đúng nơi, sống đúng chất</h1>
      <a href="/search">Bắt đầu tìm phòng</a>
    </section>
  )
}));

import HomePage from "./page";

describe("HomePage", () => {
  it("renders the standalone homepage experience at the root route", () => {
    render(<HomePage />);

    expect(screen.getByRole("heading", { level: 1, name: /RentMate/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Bắt đầu tìm phòng" })).toHaveAttribute("href", "/search");
  });
});
