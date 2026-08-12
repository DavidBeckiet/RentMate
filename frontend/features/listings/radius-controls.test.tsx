import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RadiusControls, type RadiusControlsProps } from "./radius-controls";

const onProposedCenterChange = vi.fn<RadiusControlsProps["onProposedCenterChange"]>();
const onSelectingCenterChange = vi.fn<RadiusControlsProps["onSelectingCenterChange"]>();
const onCommit = vi.fn<RadiusControlsProps["onCommit"]>();
const getCurrentPosition = vi.fn<Geolocation["getCurrentPosition"]>();

function renderControls(overrides: Partial<RadiusControlsProps> = {}) {
  return render(
    <RadiusControls
      proposedCenter={null}
      selectingCenter={false}
      resetKey={0}
      onProposedCenterChange={onProposedCenterChange}
      onSelectingCenterChange={onSelectingCenterChange}
      onCommit={onCommit}
      {...overrides}
    />
  );
}

beforeEach(() => {
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: { getCurrentPosition }
  });
});

describe("RadiusControls", () => {
  it("requests map-selection mode explicitly and validates center/radius before commit", () => {
    renderControls();
    expect(getCurrentPosition).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Chọn tâm trên bản đồ" }));
    expect(onSelectingCenterChange).toHaveBeenCalledWith(true);

    fireEvent.change(screen.getByLabelText("Bán kính (km)"), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Tìm theo bán kính" }));
    expect(screen.getByRole("alert")).toHaveTextContent("lớn hơn 0");
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("uses geolocation only after a click and waits for explicit radius submit", () => {
    getCurrentPosition.mockImplementation((success) => {
      success({ coords: { latitude: 10.75, longitude: 106.67 } } as GeolocationPosition);
    });
    const view = renderControls();
    expect(getCurrentPosition).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Dùng vị trí hiện tại" }));
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
    expect(onProposedCenterChange).toHaveBeenCalledWith({ latitude: 10.75, longitude: 106.67 });
    expect(onCommit).not.toHaveBeenCalled();

    view.rerender(
      <RadiusControls
        proposedCenter={{ latitude: 10.75, longitude: 106.67 }}
        selectingCenter={false}
        resetKey={0}
        onProposedCenterChange={onProposedCenterChange}
        onSelectingCenterChange={onSelectingCenterChange}
        onCommit={onCommit}
      />
    );
    fireEvent.change(screen.getByLabelText("Bán kính (km)"), { target: { value: "75" } });
    fireEvent.click(screen.getByRole("button", { name: "Tìm theo bán kính" }));
    expect(onCommit).toHaveBeenCalledWith({ latitude: 10.75, longitude: 106.67 }, 75);
    expect(screen.getByLabelText("Bán kính (km)")).not.toHaveAttribute("max");
  });

  it.each([
    [1, "chưa cho phép"],
    [2, "chưa xác định"],
    [3, "hết thời gian"]
  ])("shows recoverable geolocation error %s", (code, message) => {
    getCurrentPosition.mockImplementation((_success, failure) => failure?.({ code } as GeolocationPositionError));
    renderControls();
    fireEvent.click(screen.getByRole("button", { name: "Dùng vị trí hiện tại" }));
    expect(screen.getByRole("alert")).toHaveTextContent(message);
    expect(screen.getByRole("button", { name: "Chọn tâm trên bản đồ" })).toBeEnabled();
  });

  it("handles browsers without geolocation without making the radius panel fatal", () => {
    Object.defineProperty(navigator, "geolocation", { configurable: true, value: undefined });
    renderControls();
    fireEvent.click(screen.getByRole("button", { name: "Dùng vị trí hiện tại" }));
    expect(screen.getByRole("alert")).toHaveTextContent("không hỗ trợ");
    expect(onCommit).not.toHaveBeenCalled();
  });
});
