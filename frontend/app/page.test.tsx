import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../features/listings/search-page", () => ({
  SearchPage: () => (
    <section>
      <h1>Tìm phòng phù hợp tại Thành phố Hồ Chí Minh</h1>
      <form aria-label="Tìm kiếm tin đăng" />
    </section>
  )
}));

import HomePage from "./page";

describe("HomePage", () => {
  it("renders the public search experience at the root route", () => {
    render(<HomePage />);

    expect(screen.getByRole("heading", { level: 1, name: /Tìm phòng phù hợp/ })).toBeInTheDocument();
    expect(screen.getByRole("form", { name: "Tìm kiếm tin đăng" })).toBeInTheDocument();
  });
});
