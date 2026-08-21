import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../features/listings/search-page", () => ({
  SearchPage: () => (
    <section>
      <h1>Tìm đúng chỗ.</h1>
      <form aria-label="Bộ lọc tìm phòng" />
    </section>
  )
}));

import PublicSearchPage from "./page";

describe("PublicSearchPage", () => {
  it("renders the dedicated search experience at /search", () => {
    render(<PublicSearchPage />);

    expect(screen.getByRole("heading", { level: 1, name: "Tìm đúng chỗ." })).toBeInTheDocument();
    expect(screen.getByRole("form", { name: "Bộ lọc tìm phòng" })).toBeInTheDocument();
  });
});
