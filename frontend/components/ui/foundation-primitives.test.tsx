import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useRef, useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Alert } from "./alert";
import { Button } from "./button";
import { Dialog } from "./dialog";
import { Drawer } from "./drawer";
import { DropdownMenu, DropdownMenuItem } from "./dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs";
import { Toast } from "./toast";
import { Tooltip } from "./tooltip";

function DialogHarness({ drawer = false }: Readonly<{ drawer?: boolean }>) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const Overlay = drawer ? Drawer : Dialog;

  return (
    <>
      <button ref={triggerRef} type="button" onClick={() => setOpen(true)}>
        Mở
      </button>
      <Overlay
        open={open}
        title={drawer ? "Bộ lọc" : "Xác nhận hành động"}
        description="Thông tin cần đọc trước khi tiếp tục."
        triggerRef={triggerRef}
        onClose={() => setOpen(false)}
        actions={<Button onClick={() => setOpen(false)}>Xác nhận</Button>}
      >
        <p>Nội dung lớp phủ.</p>
      </Overlay>
    </>
  );
}

describe("foundation feedback primitives", () => {
  it("keeps semantic alert/toast text visible and dismissible", () => {
    const onDismiss = vi.fn();
    render(
      <>
        <Alert variant="ai-assist" title="Gợi ý từ RentMate" description="Đây là thông tin giải thích." />
        <Toast title="Đã lưu" onDismiss={onDismiss} />
      </>
    );

    expect(screen.getByRole("status", { name: "Gợi ý từ RentMate" })).toHaveTextContent("Đây là thông tin giải thích.");
    fireEvent.click(screen.getByRole("button", { name: "Đóng thông báo" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("supports keyboard selection and tabpanel semantics", () => {
    render(
      <Tabs defaultValue="list">
        <TabsList aria-label="Kiểu xem">
          <TabsTrigger value="list">Danh sách</TabsTrigger>
          <TabsTrigger value="map">Bản đồ</TabsTrigger>
        </TabsList>
        <TabsContent value="list">Danh sách phòng</TabsContent>
        <TabsContent value="map">Bản đồ phòng</TabsContent>
      </Tabs>
    );

    expect(screen.getByRole("tabpanel")).toHaveTextContent("Danh sách phòng");
    const mapTab = screen.getByRole("tab", { name: "Bản đồ" });
    fireEvent.click(mapTab);
    expect(mapTab).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Bản đồ phòng");
    fireEvent.keyDown(mapTab, { key: "ArrowLeft" });
    expect(screen.getByRole("tab", { name: "Danh sách" })).toHaveAttribute("aria-selected", "true");
  });

  it("traps dialog focus, closes on Escape, and restores the trigger", async () => {
    render(<DialogHarness />);
    const trigger = screen.getByRole("button", { name: "Mở" });
    fireEvent.click(trigger);
    const dialog = await screen.findByRole("dialog", { name: "Xác nhận hành động" });
    expect(dialog).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Đóng hộp thoại" })).toHaveFocus());

    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Xác nhận hành động" })).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it("uses the drawer presentation without changing dialog semantics", () => {
    render(<DialogHarness drawer />);
    fireEvent.click(screen.getByRole("button", { name: "Mở" }));
    const drawer = screen.getByRole("dialog", { name: "Bộ lọc" });
    expect(drawer).toHaveClass("rm-motion-drawer");
    expect(drawer).toHaveAttribute("aria-modal", "true");
  });
});

describe("foundation interaction helpers", () => {
  it("exposes a focusable tooltip and menu primitives", () => {
    render(
      <>
        <Tooltip content="Thông tin bổ sung">
          <button type="button">Trợ giúp</button>
        </Tooltip>
        <DropdownMenu label="Tùy chọn" trigger="Mở tùy chọn">
          <DropdownMenuItem onClick={() => undefined}>Một lựa chọn</DropdownMenuItem>
        </DropdownMenu>
      </>
    );

    const help = screen.getByRole("button", { name: "Trợ giúp" });
    fireEvent.focus(help);
    expect(screen.getByRole("tooltip")).toHaveTextContent("Thông tin bổ sung");
    expect(help).toHaveAttribute("aria-describedby");

    fireEvent.click(screen.getByRole("button", { name: "Tùy chọn" }));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Một lựa chọn" })).toBeInTheDocument();
  });
});
