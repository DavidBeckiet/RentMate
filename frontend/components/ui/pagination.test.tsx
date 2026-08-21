import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Pagination } from "./pagination";

describe("Pagination", () => {
  it("keeps the supplied page state and only enables available navigation", () => {
    const onPrevious = vi.fn();
    const onNext = vi.fn();
    render(
      <Pagination ariaLabel="Phân trang thử nghiệm" page={1} hasNextPage onPrevious={onPrevious} onNext={onNext} />
    );

    expect(screen.getByRole("navigation", { name: "Phân trang thử nghiệm" })).toBeInTheDocument();
    expect(screen.getByText("Trang 1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Trang trước" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Trang sau" }));
    expect(onNext).toHaveBeenCalledTimes(1);
    expect(onPrevious).not.toHaveBeenCalled();
  });
});
