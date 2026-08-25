import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import type { AuthContextValue } from "../../lib/auth/auth-provider";
import type { ListingContentBody, OwnerListingDetail, UserProfile } from "../../types/api";

const apiMocks = vi.hoisted(() => ({ updateOwned: vi.fn(), forwardGeocode: vi.fn() }));
const useAuthMock = vi.hoisted(() => vi.fn<() => AuthContextValue>());

vi.mock("../../lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("../../lib/api/client")>("../../lib/api/client");
  return { ...actual, api: { listings: apiMocks } };
});
vi.mock("../../lib/auth/auth-provider", () => ({ useAuth: useAuthMock }));
vi.mock("../../components/map/map-base", () => ({
  MapBase: ({
    ariaLabel,
    onMapClick,
    onMarkerMove
  }: {
    ariaLabel: string;
    onMapClick?: (point: { latitude: number; longitude: number }) => void;
    onMarkerMove?: (id: string | number, point: { latitude: number; longitude: number }) => void;
  }) => (
    <div role="region" aria-label={ariaLabel}>
      <button type="button" onClick={() => onMapClick?.({ latitude: 10.81, longitude: 106.71 })}>
        Đặt ghim kiểm thử
      </button>
      <button
        type="button"
        onClick={() => onMarkerMove?.("owner-draft-location", { latitude: 10.82, longitude: 106.72 })}
      >
        Kéo ghim kiểm thử
      </button>
    </div>
  )
}));

import { ApiError } from "../../lib/api/client";
import { OwnerListingEditor, type OwnerEditorFeedback } from "./owner-listing-editor";

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

function detail(overrides: Partial<OwnerListingDetail> = {}): OwnerListingDetail {
  return {
    id: 42,
    status: "DRAFT",
    title: "Studio",
    description: "Mô tả",
    monthlyRent: 7_500_000,
    roomAreaSqm: 28.5,
    maxOccupants: null,
    addressText: "101 Nguyễn Huệ",
    areaName: "Quận 1",
    latitude: 10.77,
    longitude: 106.7,
    availabilityStatus: "NOT_APPLICABLE",
    availabilityConfirmedAt: null,
    availabilityExpiresAt: null,
    propertyType: { code: "OLD_STUDIO", label: "Studio cũ" },
    amenities: [{ code: "OLD_WIFI", label: "Wi-Fi cũ" }],
    images: [],
    currentModerationReason: null,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-02T00:00:00.000Z",
    ...overrides,
    businessStatus: overrides.businessStatus ?? "UNKNOWN"
  };
}

function Harness({
  initial = detail(),
  external = null
}: {
  initial?: OwnerListingDetail;
  external?: OwnerEditorFeedback | null;
}) {
  const [canonical, setCanonical] = useState(initial);
  return (
    <>
      <span data-testid="canonical-status">{canonical.status}</span>
      <OwnerListingEditor
        detail={canonical}
        propertyTypes={{ status: "success", data: [{ code: "STUDIO", label: "Studio" }] }}
        amenities={{ status: "success", data: [{ code: "WIFI", label: "Wi-Fi" }] }}
        externalFeedback={external}
        onDetailChange={setCanonical}
        onDirtyChange={vi.fn()}
        onBusyChange={vi.fn()}
        onEdit={vi.fn()}
        onRetryPropertyTypes={vi.fn()}
        onRetryAmenities={vi.fn()}
      />
    </>
  );
}

function change(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

function save() {
  fireEvent.click(screen.getByRole("button", { name: "Lưu thay đổi" }));
}

describe("OwnerListingEditor", () => {
  beforeEach(() => {
    Object.values(apiMocks).forEach((mock) => mock.mockReset());
    refresh.mockReset();
    refresh.mockResolvedValue();
    useAuthMock.mockReturnValue({ status: "authenticated", user: landlord, error: null, refresh, logout: vi.fn() });
  });

  it("allows a fully nullable draft and sends blank dirty values as null", async () => {
    const nullable = detail({
      title: null,
      description: null,
      monthlyRent: null,
      roomAreaSqm: null,
      addressText: null,
      areaName: null,
      latitude: null,
      longitude: null,
      propertyType: null,
      amenities: []
    });
    apiMocks.updateOwned.mockResolvedValue(nullable);
    render(<Harness initial={detail()} />);
    change("Tiêu đề", "   ");
    change("Giá thuê mỗi tháng", "");
    change("Diện tích (m²)", "");
    change("Địa chỉ chính xác", "");
    change("Tên khu vực", "");
    change("Vĩ độ", "");
    change("Kinh độ", "");
    fireEvent.change(screen.getByLabelText("Loại phòng"), { target: { value: "" } });
    save();
    await waitFor(() => expect(apiMocks.updateOwned).toHaveBeenCalledOnce());
    expect(apiMocks.updateOwned.mock.calls[0][1]).toMatchObject({
      title: null,
      monthlyRent: null,
      roomAreaSqm: null,
      addressText: null,
      areaName: null,
      latitude: null,
      longitude: null,
      propertyTypeCode: null
    });
  });

  it("sends only a normalized dirty title and does not send amenities or protected fields", async () => {
    const returned = detail({ title: "Tên mới", updatedAt: "2026-08-03T00:00:00.000Z" });
    apiMocks.updateOwned.mockResolvedValue(returned);
    render(<Harness />);
    change("Tiêu đề", "  Tên mới  ");
    save();
    await waitFor(() => expect(apiMocks.updateOwned).toHaveBeenCalledOnce());
    const body = apiMocks.updateOwned.mock.calls[0][1] as ListingContentBody;
    expect(body).toEqual({ title: "Tên mới" });
    expect(body).not.toHaveProperty("amenityCodes");
    expect(body).not.toHaveProperty("status");
    expect(body).not.toHaveProperty("images");
  });

  it.each([
    ["0", "Giá thuê phải là số nguyên dương"],
    ["1.5", "Giá thuê phải là số nguyên dương"],
    ["1000000000000", "Giá thuê phải là số nguyên dương"]
  ])("validates rent %s without turning zero into null", (value, message) => {
    render(<Harness />);
    change("Giá thuê mỗi tháng", value);
    save();
    expect(screen.getByText(new RegExp(message))).toBeInTheDocument();
    expect(apiMocks.updateOwned).not.toHaveBeenCalled();
  });

  it.each(["0", "1.234", "1000000"])("validates area %s", (value) => {
    render(<Harness />);
    change("Diện tích (m²)", value);
    save();
    expect(screen.getByText(/Diện tích phải là số dương/)).toBeInTheDocument();
    expect(apiMocks.updateOwned).not.toHaveBeenCalled();
  });

  it("sends a valid max occupants value and can clear an existing value", async () => {
    apiMocks.updateOwned.mockResolvedValueOnce(detail({ maxOccupants: 4 })).mockResolvedValueOnce(detail());
    render(<Harness initial={detail()} />);
    fireEvent.change(document.getElementById("owner-max-occupants")!, { target: { value: "4" } });
    save();
    await waitFor(() => expect(apiMocks.updateOwned).toHaveBeenCalledOnce());
    expect(apiMocks.updateOwned.mock.calls[0][1]).toEqual({ maxOccupants: 4 });

    await waitFor(() => expect(document.getElementById("owner-max-occupants")).toHaveValue(4));
    fireEvent.change(document.getElementById("owner-max-occupants")!, { target: { value: "" } });
    save();
    await waitFor(() => expect(apiMocks.updateOwned).toHaveBeenCalledTimes(2));
    expect(apiMocks.updateOwned.mock.calls[1][1]).toEqual({ maxOccupants: null });
  });

  it.each(["0", "-1", "1.5", "21"])("validates max occupants %s", (value) => {
    render(<Harness />);
    fireEvent.change(document.getElementById("owner-max-occupants")!, { target: { value } });
    save();
    expect(screen.getByText(/Sức chứa phải là số nguyên từ 1 đến 20/)).toBeInTheDocument();
    expect(apiMocks.updateOwned).not.toHaveBeenCalled();
  });

  it("requires a coordinate pair and includes both when either coordinate is dirty", async () => {
    const view = render(<Harness />);
    change("Vĩ độ", "");
    save();
    expect(screen.getAllByText(/phải được nhập hoặc để trống cùng nhau/)).toHaveLength(2);
    expect(apiMocks.updateOwned).not.toHaveBeenCalled();

    view.unmount();
    apiMocks.updateOwned.mockResolvedValue(detail({ latitude: 10.8 }));
    render(<Harness />);
    change("Vĩ độ", "10.8");
    save();
    await waitFor(() => expect(apiMocks.updateOwned).toHaveBeenCalledOnce());
    expect(apiMocks.updateOwned.mock.calls[0][1]).toEqual({ latitude: 10.8, longitude: 106.7 });
  });

  it.each([
    ["Vĩ độ", "91", "Vĩ độ phải nằm trong khoảng"],
    ["Kinh độ", "-181", "Kinh độ phải nằm trong khoảng"]
  ])("validates coordinate range for %s", (label, value, message) => {
    render(<Harness />);
    change(label, value);
    save();
    expect(screen.getByText(new RegExp(message))).toBeInTheDocument();
    expect(apiMocks.updateOwned).not.toHaveBeenCalled();
  });

  it("sends the complete intended amenity set and preserves retained retired associations", async () => {
    apiMocks.updateOwned.mockResolvedValue(
      detail({
        amenities: [
          { code: "OLD_WIFI", label: "Wi-Fi cũ" },
          { code: "WIFI", label: "Wi-Fi" }
        ]
      })
    );
    render(<Harness />);
    expect(screen.getByLabelText(/Wi-Fi cũ.*không còn cho chọn mới/)).toBeChecked();
    fireEvent.click(screen.getByLabelText("Wi-Fi"));
    save();
    await waitFor(() => expect(apiMocks.updateOwned).toHaveBeenCalledOnce());
    expect(apiMocks.updateOwned.mock.calls[0][1]).toEqual({ amenityCodes: ["OLD_WIFI", "WIFI"] });
  });

  it("preserves a retired property when unchanged, then stops offering it after an active canonical save", async () => {
    apiMocks.updateOwned
      .mockResolvedValueOnce(detail({ title: "Tên khác" }))
      .mockResolvedValueOnce(detail({ title: "Tên khác", propertyType: { code: "STUDIO", label: "Studio" } }));
    render(<Harness />);
    expect(screen.getByRole("option", { name: /Studio cũ.*không còn cho chọn mới/ })).toBeDisabled();
    change("Tiêu đề", "Tên khác");
    save();
    await waitFor(() => expect(apiMocks.updateOwned).toHaveBeenCalledOnce());
    expect(apiMocks.updateOwned.mock.calls[0][1]).not.toHaveProperty("propertyTypeCode");
    await screen.findByText("Đã lưu thay đổi.");

    fireEvent.change(screen.getByLabelText("Loại phòng"), { target: { value: "STUDIO" } });
    expect(screen.getByRole("button", { name: "Lưu thay đổi" })).toBeEnabled();
    save();
    await waitFor(() => expect(apiMocks.updateOwned).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("option", { name: /Studio cũ/ })).not.toBeInTheDocument();
  });

  it("maps allowed backend field errors and keeps server details bounded", async () => {
    apiMocks.updateOwned.mockRejectedValue(
      new ApiError({
        status: 422,
        code: "VALIDATION_FAILED",
        message: "Invalid content",
        details: [
          { field: "title", code: "INVALID_VALUE", message: "Tiêu đề cần kiểm tra." },
          { field: "status", code: "FORBIDDEN", message: "private status" }
        ],
        category: "backend"
      })
    );
    render(<Harness />);
    change("Tiêu đề", "Tên khác");
    save();
    expect(await screen.findByText("Tiêu đề cần kiểm tra.")).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("private status");
  });

  it.each([
    ["DRAFT", "DRAFT"],
    ["PENDING", "PENDING"],
    ["REJECTED", "DRAFT"],
    ["APPROVED", "PENDING"],
    ["INACTIVE", "PENDING"],
    ["HIDDEN", "HIDDEN"]
  ] as const)(
    "renders the returned status for a real %s edit instead of calculating it locally",
    async (before, after) => {
      apiMocks.updateOwned.mockResolvedValue(
        detail({ status: after, title: "Tên mới", updatedAt: "2026-08-03T00:00:00.000Z" })
      );
      render(<Harness initial={detail({ status: before })} />);
      change("Tiêu đề", "Tên mới");
      save();
      await waitFor(() => expect(screen.getByTestId("canonical-status")).toHaveTextContent(after));
    }
  );

  it.each(["APPROVED", "INACTIVE"] as const)("keeps %s after a server-confirmed whitespace no-op", async (status) => {
    const canonical = detail({ status });
    apiMocks.updateOwned.mockResolvedValue(canonical);
    render(<Harness initial={canonical} />);
    change("Tiêu đề", " Studio ");
    save();
    expect(await screen.findByText("Không có thay đổi cần lưu.")).toBeInTheDocument();
    expect(screen.getByTestId("canonical-status")).toHaveTextContent(status);
    expect(apiMocks.updateOwned.mock.calls[0][1]).toEqual({ title: "Studio" });
  });

  it("provides explicit revert and never PATCHes in the background", () => {
    render(<Harness />);
    change("Tiêu đề", "Chưa lưu");
    expect(apiMocks.updateOwned).not.toHaveBeenCalled();
    expect(screen.getByText(/Bạn có thay đổi chưa lưu/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Hoàn tác thay đổi" }));
    expect(screen.getByLabelText("Tiêu đề")).toHaveValue("Studio");
    expect(screen.getByRole("button", { name: "Lưu thay đổi" })).toBeDisabled();
    expect(apiMocks.updateOwned).not.toHaveBeenCalled();
  });

  it("composes geocoding into the existing address/coordinate draft and persists candidate coordinates only on save", async () => {
    apiMocks.forwardGeocode.mockResolvedValue([
      { displayName: "102 Nguyễn Huệ, Quận 1", latitude: 10.775, longitude: 106.704 }
    ]);
    apiMocks.updateOwned.mockResolvedValue(
      detail({ addressText: "102 Nguyễn Huệ", latitude: 10.775, longitude: 106.704 })
    );
    render(<Harness />);
    change("Tiêu đề", "Nháp chưa lưu");
    change("Địa chỉ chính xác", "  102 Nguyễn Huệ  ");
    expect(apiMocks.forwardGeocode).not.toHaveBeenCalled();
    expect(apiMocks.updateOwned).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Tìm vị trí từ địa chỉ" }));
    await waitFor(() => expect(apiMocks.forwardGeocode).toHaveBeenCalledOnce());
    expect(apiMocks.forwardGeocode.mock.calls[0][0]).toEqual({ addressText: "102 Nguyễn Huệ" });
    fireEvent.click(await screen.findByRole("button", { name: "102 Nguyễn Huệ, Quận 1" }));
    expect(screen.getByLabelText("Địa chỉ chính xác")).toHaveValue("  102 Nguyễn Huệ  ");
    expect(screen.getByLabelText("Vĩ độ")).toHaveValue(10.775);
    expect(screen.getByLabelText("Kinh độ")).toHaveValue(106.704);
    expect(apiMocks.updateOwned).not.toHaveBeenCalled();
    save();
    await waitFor(() => expect(apiMocks.updateOwned).toHaveBeenCalledOnce());
    expect(apiMocks.updateOwned.mock.calls[0][1]).toMatchObject({
      title: "Nháp chưa lưu",
      addressText: "102 Nguyễn Huệ",
      latitude: 10.775,
      longitude: 106.704
    });
  });

  it("uses map click and marker drag to update the same coordinate fields without geocoding or autosave", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Đặt ghim kiểm thử" }));
    expect(screen.getByLabelText("Vĩ độ")).toHaveValue(10.81);
    expect(screen.getByLabelText("Kinh độ")).toHaveValue(106.71);
    fireEvent.click(screen.getByRole("button", { name: "Kéo ghim kiểm thử" }));
    expect(screen.getByLabelText("Vĩ độ")).toHaveValue(10.82);
    expect(screen.getByLabelText("Kinh độ")).toHaveValue(106.72);
    expect(screen.getByText(/Bạn có thay đổi chưa lưu/)).toBeInTheDocument();
    expect(apiMocks.forwardGeocode).not.toHaveBeenCalled();
    expect(apiMocks.updateOwned).not.toHaveBeenCalled();
  });

  it("keeps all unsaved editor fields usable after a geocoding provider failure", async () => {
    apiMocks.forwardGeocode.mockRejectedValue(
      new ApiError({ status: 502, code: "GEOCODING_PROVIDER_ERROR", message: "private", category: "backend" })
    );
    render(<Harness />);
    change("Tiêu đề", "Nháp còn nguyên");
    change("Địa chỉ chính xác", "Địa chỉ đang sửa");
    change("Vĩ độ", "10.9");
    change("Kinh độ", "106.9");
    fireEvent.click(screen.getByRole("button", { name: "Tìm vị trí từ địa chỉ" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Dịch vụ định vị tạm thời không khả dụng.");
    expect(screen.getByLabelText("Tiêu đề")).toHaveValue("Nháp còn nguyên");
    expect(screen.getByLabelText("Địa chỉ chính xác")).toHaveValue("Địa chỉ đang sửa");
    expect(screen.getByLabelText("Vĩ độ")).toHaveValue(10.9);
    expect(screen.getByLabelText("Kinh độ")).toHaveValue(106.9);
    expect(apiMocks.updateOwned).not.toHaveBeenCalled();
  });
});
