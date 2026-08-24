import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ListingStatus } from "../../types/api";
import { Badge } from "./badge";
import { Button } from "./button";
import { Card } from "./card";
import { EmptyState, ErrorState, LoadingState } from "./feedback-states";
import { Icon } from "./icon";
import { IconButton } from "./icon-button";
import { Skeleton } from "./skeleton";
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

  it("preserves the native disabled state and supports the scoped semantic variants", () => {
    const onClick = vi.fn();
    render(
      <>
        <Button disabled onClick={onClick}>
          Không khả dụng
        </Button>
        <Button variant="outline">Viền</Button>
        <Button variant="ghost">Tối giản</Button>
      </>
    );

    fireEvent.click(screen.getByRole("button", { name: "Không khả dụng" }));
    expect(screen.getByRole("button", { name: "Không khả dụng" })).toBeDisabled();
    expect(onClick).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Viền" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Tối giản" })).toBeEnabled();
  });
});

describe("IconButton", () => {
  it("requires a caller-provided accessible label", () => {
    render(
      <IconButton label="Đóng cửa sổ">
        <Icon name="close" />
      </IconButton>
    );

    expect(screen.getByRole("button", { name: "Đóng cửa sổ" })).toHaveAttribute("type", "button");
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

  it("supports generic semantic and category badges without relying on color alone", () => {
    render(
      <Badge variant="info" context="Loại tin" showIndicator>
        Phòng trọ
      </Badge>
    );

    expect(screen.getByText("Phòng trọ")).toBeVisible();
    expect(screen.getByText("Loại tin:")).toHaveClass("sr-only");
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
    const onAction = vi.fn();
    render(
      <EmptyState
        title="Chưa có tin đăng"
        description="Thử thay đổi bộ lọc."
        action={<Button onClick={onAction}>Đặt lại</Button>}
      />
    );
    expect(screen.getByRole("heading", { name: "Chưa có tin đăng" })).toBeInTheDocument();
    expect(screen.getByText("Thử thay đổi bộ lọc.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Đặt lại" }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it("renders only the safe error message, request id, and recovery action supplied by the caller", () => {
    render(<ErrorState message="Vui lòng thử lại." requestId="req-046" action={<Button>Thử lại</Button>} />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Vui lòng thử lại.");
    expect(alert).toHaveTextContent("Mã yêu cầu: req-046");
    expect(screen.getByRole("button", { name: "Thử lại" })).toBeInTheDocument();
    expect(alert).not.toHaveTextContent("stack");
  });

  it("supports a safe caller-owned retry behavior", () => {
    const onRetry = vi.fn();
    render(<ErrorState message="Kết nối bị gián đoạn." onRetry={onRetry} retryLabel="Kết nối lại" />);

    fireEvent.click(screen.getByRole("button", { name: "Kết nối lại" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe("surface primitives", () => {
  it("keeps Card content semantic and Skeleton hidden from assistive technology", () => {
    render(
      <Card aria-label="Thông tin chỗ ở">
        Nội dung
        <Skeleton data-testid="skeleton" className="h-4 w-full" />
      </Card>
    );

    expect(screen.getByLabelText("Thông tin chỗ ở")).toHaveTextContent("Nội dung");
    expect(screen.getByTestId("skeleton")).toHaveAttribute("aria-hidden", "true");
  });
});
