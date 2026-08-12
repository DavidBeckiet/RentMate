import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ListingStatus } from "../../types/api";
import { Button } from "./button";
import { EmptyState, ErrorState, LoadingState } from "./feedback-states";
import { AccountStatusBadge, ListingStatusBadge } from "./status-badge";

describe("Button", () => {
  it("defaults to a non-submit native button and delegates clicks to the caller", () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Tiếp tục</Button>);

    const button = screen.getByRole("button", { name: "Tiếp tục" });
    expect(button).toHaveAttribute("type", "button");
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("shows an explicit pending label and blocks duplicate clicks", () => {
    const onClick = vi.fn();
    render(
      <Button pending pendingLabel="Đang lưu…" onClick={onClick}>
        Lưu
      </Button>
    );

    const button = screen.getByRole("button", { name: "Đang lưu…" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe("status badges", () => {
  it("renders every frozen listing status with Vietnamese text", () => {
    const cases: ReadonlyArray<readonly [ListingStatus, string]> = [
      ["DRAFT", "Nháp"],
      ["PENDING", "Chờ duyệt"],
      ["APPROVED", "Đã duyệt"],
      ["REJECTED", "Bị từ chối"],
      ["HIDDEN", "Đã ẩn"],
      ["INACTIVE", "Ngừng hoạt động"]
    ];

    const { rerender } = render(<ListingStatusBadge status="DRAFT" />);
    for (const [status, label] of cases) {
      rerender(<ListingStatusBadge status={status} />);
      expect(screen.getByText(label)).toBeVisible();
    }
  });

  it("renders active and inactive account status with text as well as color", () => {
    const { rerender } = render(<AccountStatusBadge isActive />);
    expect(screen.getByText("Đang hoạt động")).toBeVisible();
    rerender(<AccountStatusBadge isActive={false} />);
    expect(screen.getByText("Ngừng hoạt động")).toBeVisible();
  });
});

describe("feedback states", () => {
  it("announces a visible loading message with reduced-motion support", () => {
    render(<LoadingState message="Đang tải danh sách…" />);
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveTextContent("Đang tải danh sách…");
    expect(status.querySelector("[aria-hidden='true']")).toHaveClass("motion-reduce:animate-none");
  });

  it("supports explanatory empty content and a caller-owned action", () => {
    render(
      <EmptyState title="Chưa có tin đăng" description="Thử thay đổi bộ lọc." action={<Button>Đặt lại</Button>} />
    );
    expect(screen.getByRole("heading", { name: "Chưa có tin đăng" })).toBeInTheDocument();
    expect(screen.getByText("Thử thay đổi bộ lọc.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Đặt lại" })).toBeInTheDocument();
  });

  it("renders only the safe error message, request id, and recovery action supplied by the caller", () => {
    render(<ErrorState message="Vui lòng thử lại." requestId="req-046" action={<Button>Thử lại</Button>} />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Vui lòng thử lại.");
    expect(alert).toHaveTextContent("Mã yêu cầu: req-046");
    expect(screen.getByRole("button", { name: "Thử lại" })).toBeInTheDocument();
    expect(alert).not.toHaveTextContent("stack");
  });
});
