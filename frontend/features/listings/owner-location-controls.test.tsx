import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContextValue } from "../../lib/auth/auth-provider";
import type { GeocodingCandidate, UserProfile } from "../../types/api";

const apiMocks = vi.hoisted(() => ({ forwardGeocode: vi.fn() }));
const useAuthMock = vi.hoisted(() => vi.fn<() => AuthContextValue>());

vi.mock("../../lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("../../lib/api/client")>("../../lib/api/client");
  return { ...actual, api: { listings: { forwardGeocode: apiMocks.forwardGeocode } } };
});
vi.mock("../../lib/auth/auth-provider", () => ({ useAuth: useAuthMock }));
vi.mock("../../components/map/map-base", () => ({
  MapBase: ({
    ariaLabel,
    center,
    markers = [],
    onMapClick,
    onMarkerMove
  }: {
    ariaLabel: string;
    center: { latitude: number; longitude: number };
    markers?: readonly {
      id: string | number;
      position: { latitude: number; longitude: number };
      draggable?: boolean;
    }[];
    onMapClick?: (point: { latitude: number; longitude: number }) => void;
    onMarkerMove?: (id: string | number, point: { latitude: number; longitude: number }) => void;
  }) => (
    <div role="region" aria-label={ariaLabel}>
      <span data-testid="map-center">{`${center.latitude},${center.longitude}`}</span>
      <span data-testid="map-marker">
        {markers[0]
          ? `${markers[0].position.latitude},${markers[0].position.longitude}:${String(markers[0].draggable)}`
          : "none"}
      </span>
      <button type="button" onClick={() => onMapClick?.({ latitude: 10.81, longitude: 106.71 })}>
        Đặt ghim trên bản đồ
      </button>
      <button
        type="button"
        onClick={() => onMarkerMove?.("owner-draft-location", { latitude: 10.82, longitude: 106.72 })}
      >
        Kéo ghim
      </button>
    </div>
  )
}));

import { ApiError } from "../../lib/api/client";
import { OwnerLocationControls } from "./owner-location-controls";

const landlord: UserProfile = {
  id: 7,
  displayName: null,
  role: "LANDLORD",
  email: "owner@example.com",
  phone: "+84901234567",
  isActive: true,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z"
};
const refresh = vi.fn<() => Promise<void>>();

function Harness({ initialAddress = "101 Nguyễn Huệ" }: { readonly initialAddress?: string }) {
  const [address, setAddress] = useState(initialAddress);
  const [latitude, setLatitude] = useState("10.77");
  const [longitude, setLongitude] = useState("106.7");
  return (
    <>
      <label htmlFor="address-harness">Địa chỉ nháp</label>
      <input id="address-harness" value={address} onChange={(event) => setAddress(event.target.value)} />
      <OwnerLocationControls
        addressText={address}
        latitude={latitude}
        longitude={longitude}
        onCoordinatesChange={(nextLatitude, nextLongitude) => {
          setLatitude(nextLatitude);
          setLongitude(nextLongitude);
        }}
      />
      <output data-testid="draft">{`${address}|${latitude}|${longitude}`}</output>
    </>
  );
}

function candidates(count: number): readonly GeocodingCandidate[] {
  return Array.from({ length: count }, (_, index) => ({
    displayName: `Kết quả ${index + 1}`,
    latitude: 10.7 + index / 100,
    longitude: 106.6 + index / 100
  }));
}

describe("OwnerLocationControls", () => {
  beforeEach(() => {
    apiMocks.forwardGeocode.mockReset();
    refresh.mockReset();
    refresh.mockResolvedValue();
    useAuthMock.mockReturnValue({ status: "authenticated", user: landlord, error: null, refresh, logout: vi.fn() });
  });

  it("geocodes only after the explicit action and sends the trimmed draft address once", async () => {
    apiMocks.forwardGeocode.mockResolvedValue([]);
    render(<Harness initialAddress="  101 Nguyễn Huệ  " />);
    expect(apiMocks.forwardGeocode).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Địa chỉ nháp"), { target: { value: "  102 Nguyễn Huệ  " } });
    fireEvent.blur(screen.getByLabelText("Địa chỉ nháp"));
    expect(apiMocks.forwardGeocode).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Tìm vị trí từ địa chỉ" }));
    await waitFor(() => expect(apiMocks.forwardGeocode).toHaveBeenCalledOnce());
    expect(apiMocks.forwardGeocode).toHaveBeenCalledWith({ addressText: "102 Nguyễn Huệ" }, expect.any(AbortSignal));
    expect(await screen.findByText("Không tìm thấy vị trí phù hợp.")).toBeInTheDocument();
    expect(screen.getByLabelText("Địa chỉ nháp")).toHaveValue("  102 Nguyễn Huệ  ");
    expect(screen.getByTestId("draft")).toHaveTextContent("10.77|106.7");
  });

  it.each([
    ["   ", "Hãy nhập địa chỉ trước khi tìm vị trí"],
    ["a".repeat(501), "Địa chỉ không được vượt quá 500 ký tự"]
  ])("rejects invalid address input without V1-22: %s", async (address, message) => {
    render(<Harness initialAddress={address} />);
    fireEvent.click(screen.getByRole("button", { name: "Tìm vị trí từ địa chỉ" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(apiMocks.forwardGeocode).not.toHaveBeenCalled();
  });

  it.each([0, 1, 5])("renders a normalized response with %s candidates", async (count) => {
    apiMocks.forwardGeocode.mockResolvedValue(candidates(count));
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Tìm vị trí từ địa chỉ" }));
    if (count === 0) {
      expect(await screen.findByText("Không tìm thấy vị trí phù hợp.")).toBeInTheDocument();
    } else {
      expect(await screen.findAllByRole("button", { name: /Kết quả/ })).toHaveLength(count);
      expect(document.body).not.toHaveTextContent("place_id");
    }
  });

  it("selects a candidate into the shared coordinate draft without changing address or PATCHing", async () => {
    apiMocks.forwardGeocode.mockResolvedValue(candidates(1));
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Tìm vị trí từ địa chỉ" }));
    fireEvent.click(await screen.findByRole("button", { name: "Kết quả 1" }));
    expect(screen.getByTestId("draft")).toHaveTextContent("101 Nguyễn Huệ|10.7|106.6");
    expect(apiMocks.forwardGeocode).toHaveBeenCalledOnce();
  });

  it.each([
    [401, "UNAUTHENTICATED", "Phiên đăng nhập không còn hợp lệ"],
    [403, "FORBIDDEN", "không có quyền sử dụng chức năng định vị"],
    [422, "VALIDATION_FAILED", "Địa chỉ chưa hợp lệ"],
    [429, "RATE_LIMITED", "Dịch vụ định vị đang giới hạn yêu cầu. Hãy thử lại sau."],
    [502, "GEOCODING_PROVIDER_ERROR", "Dịch vụ định vị tạm thời không khả dụng."],
    [null, "NETWORK_ERROR", "Không thể kết nối dịch vụ định vị"]
  ] as const)("preserves the complete draft after %s/%s", async (status, code, message) => {
    apiMocks.forwardGeocode.mockRejectedValue(
      new ApiError({ status, code, message: "private", category: status === null ? "network" : "backend" })
    );
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Tìm vị trí từ địa chỉ" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(screen.getByTestId("draft")).toHaveTextContent("101 Nguyễn Huệ|10.77|106.7");
    expect(apiMocks.forwardGeocode).toHaveBeenCalledOnce();
    if (status === 401) await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    else expect(refresh).not.toHaveBeenCalled();
  });

  it("aborts an in-flight request on unmount without replay", async () => {
    apiMocks.forwardGeocode.mockImplementation(
      (_body: unknown, signal: AbortSignal) =>
        new Promise((_resolve, reject) =>
          signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")))
        )
    );
    const view = render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Tìm vị trí từ địa chỉ" }));
    await waitFor(() => expect(apiMocks.forwardGeocode).toHaveBeenCalledOnce());
    const signal = apiMocks.forwardGeocode.mock.calls[0][1] as AbortSignal;
    view.unmount();
    expect(signal.aborted).toBe(true);
    expect(apiMocks.forwardGeocode).toHaveBeenCalledOnce();
  });

  it("keeps one parent coordinate source for existing marker, map click, and marker drag", () => {
    render(<Harness />);
    expect(screen.getByTestId("map-center")).toHaveTextContent("10.77,106.7");
    expect(screen.getByTestId("map-marker")).toHaveTextContent("10.77,106.7:true");
    fireEvent.click(screen.getByRole("button", { name: "Đặt ghim trên bản đồ" }));
    expect(screen.getByTestId("draft")).toHaveTextContent("101 Nguyễn Huệ|10.81|106.71");
    fireEvent.click(screen.getByRole("button", { name: "Kéo ghim" }));
    expect(screen.getByTestId("draft")).toHaveTextContent("101 Nguyễn Huệ|10.82|106.72");
    expect(apiMocks.forwardGeocode).not.toHaveBeenCalled();
  });
});
