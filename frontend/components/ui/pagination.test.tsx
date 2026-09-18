import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Pagination } from "./pagination";

describe("Pagination", () => {
  it("hides controls when the collection has only one page", () => {
    render(
      <Pagination ariaLabel="Phân trang một trang" page={1} hasNextPage={false} onPrevious={vi.fn()} onNext={vi.fn()} />
    );

    expect(screen.queryByRole("navigation", { name: "Phân trang một trang" })).not.toBeInTheDocument();
  });

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

  it("supports a compact presentation while preserving disabled navigation", () => {
    render(
      <Pagination
        ariaLabel="Phân trang gọn"
        compact
        page={2}
        hasNextPage={false}
        onPrevious={vi.fn()}
        onNext={vi.fn()}
      />
    );

    const navigation = screen.getByRole("navigation", { name: "Phân trang gọn" });
    expect(navigation).toHaveClass("p-2.5");
    expect(screen.getByRole("button", { name: "Trước" })).toHaveClass("!min-h-11", "!rounded-xl");
    expect(screen.getByRole("button", { name: "Sau" })).toBeDisabled();
  });

  it("centers moderation controls with a selected current page and accessible chevrons", () => {
    const onPrevious = vi.fn();
    const onNext = vi.fn();
    const view = render(
      <Pagination
        ariaLabel="Phân trang hàng đợi kiểm duyệt"
        page={1}
        hasNextPage
        onPrevious={onPrevious}
        onNext={onNext}
        variant="moderation"
      />
    );

    const navigation = screen.getByRole("navigation", { name: "Phân trang hàng đợi kiểm duyệt" });
    expect(navigation).toHaveClass("mx-auto", "w-fit");
    expect(navigation.querySelector('[aria-current="page"]')).toHaveTextContent("1");
    expect(navigation.querySelectorAll("button")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Trang trước" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Trang sau" }));
    expect(onNext).toHaveBeenCalledOnce();

    view.rerender(
      <Pagination
        ariaLabel="Phân trang hàng đợi kiểm duyệt"
        page={2}
        hasNextPage={false}
        onPrevious={onPrevious}
        onNext={onNext}
        variant="moderation"
      />
    );
    expect(navigation.querySelector('[aria-current="page"]')).toHaveTextContent("2");
    expect(screen.getByRole("button", { name: "Trang sau" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Trang trước" }));
    expect(onPrevious).toHaveBeenCalledOnce();
  });
});
