import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContextValue } from "../../lib/auth/auth-provider";
import type { OwnerImage, OwnerListingDetail, UserProfile } from "../../types/api";

const apiMocks = vi.hoisted(() => ({
  uploadImage: vi.fn(),
  deleteImage: vi.fn(),
  reorderImages: vi.fn(),
  getOwned: vi.fn()
}));
const useAuthMock = vi.hoisted(() => vi.fn<() => AuthContextValue>());

vi.mock("../../lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("../../lib/api/client")>("../../lib/api/client");
  return { ...actual, api: { listings: apiMocks } };
});
vi.mock("../../lib/auth/auth-provider", () => ({ useAuth: useAuthMock }));
vi.mock("next/image", () => ({ default: ({ alt }: { alt: string }) => <span role="img" aria-label={alt} /> }));

import { ApiError } from "../../lib/api/client";
import { OwnerImageManager } from "./owner-image-manager";

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

function image(id: number, displayOrder: number): OwnerImage {
  return {
    id,
    url: `https://example.com/${id}.webp`,
    altText: `Ảnh ${id}`,
    displayOrder,
    format: "webp",
    width: 800,
    height: 600,
    byteSize: 123_456,
    createdAt: "2026-08-01T00:00:00.000Z"
  };
}

function images(count: number): readonly OwnerImage[] {
  return Array.from({ length: count }, (_, index) => image(index + 1, index * 2 + 1));
}

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
    propertyType: { code: "STUDIO", label: "Studio" },
    amenities: [],
    images: images(3),
    currentModerationReason: null,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-02T00:00:00.000Z",
    ...overrides,
    businessStatus: overrides.businessStatus ?? "UNKNOWN"
  };
}

function Harness({
  initial = detail(),
  contentBlocked = false
}: {
  initial?: OwnerListingDetail;
  contentBlocked?: boolean;
}) {
  const [canonical, setCanonical] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [orderDirty, setOrderDirty] = useState(false);
  return (
    <>
      <output data-testid="canonical">{`${canonical.status}:${canonical.images.length}`}</output>
      <output data-testid="coordination">{`${String(busy)}:${String(orderDirty)}`}</output>
      <OwnerImageManager
        detail={canonical}
        contentBlocked={contentBlocked}
        onCanonicalChange={setCanonical}
        onBusyChange={setBusy}
        onOrderDirtyChange={setOrderDirty}
      />
    </>
  );
}

function chooseFile(file = new File(["image"], "room.webp", { type: "image/webp" }), replacement = false) {
  fireEvent.change(screen.getByLabelText(replacement ? "Ảnh mới" : "Chọn một ảnh"), { target: { files: [file] } });
  return file;
}

function upload() {
  fireEvent.click(screen.getByRole("button", { name: "Tải ảnh lên" }));
}

function backendError(status: number | null, code: string): ApiError {
  return new ApiError({
    status,
    code,
    message: "private backend detail",
    requestId: "req-safe",
    category: status === null ? "network" : "backend"
  });
}

describe("OwnerImageManager", () => {
  beforeEach(() => {
    Object.values(apiMocks).forEach((mock) => mock.mockReset());
    refresh.mockReset();
    refresh.mockResolvedValue();
    useAuthMock.mockReturnValue({ status: "authenticated", user: landlord, error: null, refresh, logout: vi.fn() });
  });

  it("sorts canonical images with gapped displayOrder and derives the cover from proposed order", () => {
    render(<Harness initial={detail({ images: [image(3, 9), image(1, 1), image(2, 4)] })} />);
    expect(screen.getAllByRole("img").map((item) => item.getAttribute("aria-label"))).toEqual([
      "Ảnh 1",
      "Ảnh 2",
      "Ảnh 3"
    ]);
    expect(screen.getByText("Ảnh bìa")).toBeInTheDocument();
    expect(screen.getByText("Vị trí đã lưu: 4")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Đưa ảnh 1 lên" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Đưa ảnh 3 xuống" })).toBeDisabled();
  });

  it.each([
    ["image/jpeg", "room.jpg"],
    ["image/png", "room.png"],
    ["image/webp", "room.webp"]
  ])("accepts one %s file, trims alt text, and refreshes V1-13 after 201", async (type, name) => {
    const returned = detail({ status: "PENDING", images: [...images(3), image(4, 8)] });
    apiMocks.uploadImage.mockResolvedValue(image(4, 8));
    apiMocks.getOwned.mockResolvedValue(returned);
    render(<Harness />);
    const file = chooseFile(new File(["image"], name, { type }));
    fireEvent.change(screen.getByLabelText("Mô tả ảnh (không bắt buộc)"), { target: { value: "  Phòng sáng  " } });
    upload();
    await waitFor(() => expect(apiMocks.uploadImage).toHaveBeenCalledOnce());
    expect(apiMocks.uploadImage).toHaveBeenCalledWith(
      42,
      { image: file, altText: "Phòng sáng" },
      expect.any(AbortSignal)
    );
    await waitFor(() => expect(apiMocks.getOwned).toHaveBeenCalledOnce());
    expect(screen.getByTestId("canonical")).toHaveTextContent("PENDING:4");
  });

  it("omits blank alt text from UploadImageInput", async () => {
    apiMocks.uploadImage.mockResolvedValue(image(4, 8));
    apiMocks.getOwned.mockResolvedValue(detail({ images: [...images(3), image(4, 8)] }));
    render(<Harness />);
    const file = chooseFile();
    fireEvent.change(screen.getByLabelText("Mô tả ảnh (không bắt buộc)"), { target: { value: "   " } });
    upload();
    await waitFor(() => expect(apiMocks.uploadImage).toHaveBeenCalledOnce());
    expect(apiMocks.uploadImage.mock.calls[0][1]).toEqual({ image: file });
  });

  it.each([
    [new File([new Uint8Array(5_242_881)], "large.webp", { type: "image/webp" }), "vượt quá giới hạn 5 MiB"],
    [new File(["text"], "room.gif", { type: "image/gif" }), "phải là JPEG, PNG hoặc WebP"],
    [new File(["image"], "room.webp", { type: "image/webp" }), "không được vượt quá 255 ký tự"]
  ])("rejects invalid local upload input: %s", async (file, message) => {
    render(<Harness />);
    chooseFile(file);
    if (message.includes("255")) {
      fireEvent.change(screen.getByLabelText("Mô tả ảnh (không bắt buộc)"), {
        target: { value: "ấ".repeat(256) }
      });
    }
    upload();
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(apiMocks.uploadImage).not.toHaveBeenCalled();
  });

  it("prevents duplicate POST while upload is pending and does not render an optimistic image", async () => {
    let resolveUpload!: (value: OwnerImage) => void;
    apiMocks.uploadImage.mockReturnValue(
      new Promise<OwnerImage>((resolve) => {
        resolveUpload = resolve;
      })
    );
    apiMocks.getOwned.mockResolvedValue(detail({ images: [...images(3), image(4, 8)] }));
    render(<Harness />);
    chooseFile();
    upload();
    expect(screen.getByRole("button", { name: "Đang tải ảnh…" })).toHaveAttribute("aria-busy", "true");
    fireEvent.click(screen.getByRole("button", { name: "Đang tải ảnh…" }));
    expect(apiMocks.uploadImage).toHaveBeenCalledOnce();
    expect(screen.getAllByRole("img")).toHaveLength(3);
    resolveUpload(image(4, 8));
    await waitFor(() => expect(apiMocks.getOwned).toHaveBeenCalledOnce());
  });

  it.each([
    [413, "PAYLOAD_TOO_LARGE", "Ảnh vượt quá giới hạn 5 MiB."],
    [415, "UNSUPPORTED_MEDIA_TYPE", "Ảnh phải là JPEG, PNG hoặc WebP hợp lệ."],
    [422, "IMAGE_LIMIT_EXCEEDED", "Đã đạt giới hạn 8 ảnh."],
    [502, "IMAGE_PROVIDER_ERROR", "Dịch vụ lưu ảnh tạm thời không khả dụng."],
    [401, "UNAUTHENTICATED", "Phiên đăng nhập không còn hợp lệ"],
    [403, "FORBIDDEN", "không có quyền quản lý ảnh"],
    [404, "NOT_FOUND", "không tồn tại hay bạn không thể truy cập"]
  ] as const)("maps upload %s/%s without exposing backend detail", async (status, code, message) => {
    apiMocks.uploadImage.mockRejectedValue(backendError(status, code));
    apiMocks.getOwned.mockResolvedValue(detail({ images: images(8) }));
    render(<Harness />);
    chooseFile();
    upload();
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(document.body).not.toHaveTextContent("private backend detail");
    expect(apiMocks.uploadImage).toHaveBeenCalledOnce();
    if (code === "IMAGE_LIMIT_EXCEEDED") await waitFor(() => expect(apiMocks.getOwned).toHaveBeenCalledOnce());
    if (status === 401) await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
  });

  it("stops after ambiguous upload and requires canonical reload before another attempt", async () => {
    apiMocks.uploadImage.mockRejectedValue(backendError(null, "NETWORK_ERROR"));
    apiMocks.getOwned.mockResolvedValue(detail({ images: [...images(3), image(4, 8)] }));
    render(<Harness />);
    chooseFile();
    upload();
    expect(await screen.findByRole("alert")).toHaveTextContent("Không thể xác nhận ảnh đã được tải lên");
    expect(apiMocks.uploadImage).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Tải ảnh lên" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Tải lại tin" }));
    await waitFor(() => expect(apiMocks.getOwned).toHaveBeenCalledOnce());
    expect(apiMocks.uploadImage).toHaveBeenCalledOnce();
  });

  it("allows confirmed deletion of the final DRAFT image and refreshes canonical detail after 204", async () => {
    apiMocks.deleteImage.mockResolvedValue(undefined);
    apiMocks.getOwned.mockResolvedValue(detail({ images: [] }));
    render(<Harness initial={detail({ images: [image(1, 3)] })} />);
    fireEvent.click(screen.getByRole("button", { name: "Xóa ảnh 1" }));
    expect(screen.getByText("Xóa ảnh này?")).toBeInTheDocument();
    expect(apiMocks.deleteImage).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Xác nhận" }));
    await waitFor(() => expect(apiMocks.deleteImage).toHaveBeenCalledWith(42, 1, expect.any(AbortSignal)));
    await waitFor(() => expect(apiMocks.getOwned).toHaveBeenCalledOnce());
    expect(screen.getByTestId("canonical")).toHaveTextContent("DRAFT:0");
  });

  it("guards the final image of a non-DRAFT listing in the UX", () => {
    render(<Harness initial={detail({ status: "APPROVED", images: [image(1, 1)] })} />);
    expect(screen.getByRole("button", { name: "Xóa ảnh 1" })).toBeDisabled();
    expect(screen.getByText("Tin không phải bản nháp phải giữ ít nhất một ảnh.")).toBeInTheDocument();
  });

  it("handles server LAST_IMAGE_REQUIRED and refreshes stale canonical state", async () => {
    apiMocks.deleteImage.mockRejectedValue(backendError(422, "LAST_IMAGE_REQUIRED"));
    apiMocks.getOwned.mockResolvedValue(detail({ status: "PENDING", images: [image(1, 1)] }));
    render(<Harness initial={detail({ images: [image(1, 1)] })} />);
    fireEvent.click(screen.getByRole("button", { name: "Xóa ảnh 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Xác nhận" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("phải giữ ít nhất một ảnh");
    await waitFor(() => expect(apiMocks.getOwned).toHaveBeenCalledOnce());
  });

  it("does not repeat an ambiguous DELETE and reloads canonical state first", async () => {
    apiMocks.deleteImage.mockRejectedValue(backendError(null, "NETWORK_ERROR"));
    apiMocks.getOwned.mockResolvedValue(detail());
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Xóa ảnh 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Xác nhận" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Không thể xác nhận ảnh đã được xóa");
    expect(apiMocks.deleteImage).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Tải lại tin" }));
    await waitFor(() => expect(apiMocks.getOwned).toHaveBeenCalledOnce());
    expect(apiMocks.deleteImage).toHaveBeenCalledOnce();
  });

  it("keeps move local, saves every canonical ID exactly once, and refreshes after reorder", async () => {
    const canonical = detail({ images: [image(1, 1), image(2, 4), image(3, 9)] });
    const reordered = detail({ images: [image(2, 1), image(1, 2), image(3, 3)] });
    apiMocks.reorderImages.mockResolvedValue(reordered.images);
    apiMocks.getOwned.mockResolvedValue(reordered);
    render(<Harness initial={canonical} />);
    fireEvent.click(screen.getByRole("button", { name: "Đưa ảnh 2 lên" }));
    expect(apiMocks.reorderImages).not.toHaveBeenCalled();
    expect(screen.getByTestId("coordination")).toHaveTextContent("false:true");
    fireEvent.click(screen.getByRole("button", { name: "Lưu thứ tự ảnh" }));
    await waitFor(() =>
      expect(apiMocks.reorderImages).toHaveBeenCalledWith(42, { imageIds: [2, 1, 3] }, expect.any(AbortSignal))
    );
    await waitFor(() => expect(apiMocks.getOwned).toHaveBeenCalledOnce());
    await waitFor(() => expect(screen.getByTestId("coordination")).toHaveTextContent("false:false"));
  });

  it("does not call V1-21 for a no-op and supports explicit local revert", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Lưu thứ tự ảnh" }));
    expect(await screen.findByText("Thứ tự ảnh không thay đổi.")).toBeInTheDocument();
    expect(apiMocks.reorderImages).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Đưa ảnh 2 lên" }));
    fireEvent.click(screen.getByRole("button", { name: "Hoàn tác thứ tự" }));
    expect(screen.getByTestId("coordination")).toHaveTextContent("false:false");
  });

  it("does not replay stale reorder IDs after 409 and resets from refreshed canonical images", async () => {
    apiMocks.reorderImages.mockRejectedValue(backendError(409, "CONCURRENT_MODIFICATION"));
    apiMocks.getOwned.mockResolvedValue(detail({ images: [image(3, 1), image(2, 2)] }));
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Đưa ảnh 2 lên" }));
    fireEvent.click(screen.getByRole("button", { name: "Lưu thứ tự ảnh" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Danh sách ảnh đã thay đổi");
    await waitFor(() => expect(apiMocks.getOwned).toHaveBeenCalledOnce());
    expect(apiMocks.reorderImages).toHaveBeenCalledOnce();
    await waitFor(() =>
      expect(screen.getAllByRole("img").map((item) => item.getAttribute("aria-label"))).toEqual(["Ảnh 3", "Ảnh 2"])
    );
  });

  it("blocks all image mutations while content is dirty or saving", () => {
    render(<Harness contentBlocked />);
    expect(screen.getByText("Hãy lưu hoặc hoàn tác thay đổi nội dung trước khi quản lý ảnh.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tải ảnh lên" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Xóa ảnh 1" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Đưa ảnh 2 lên" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Thay ảnh 1" })).toBeDisabled();
  });

  it("replaces below the limit as two explicit upload-then-delete steps", async () => {
    const initial = detail({ images: images(7) });
    const afterUpload = detail({ images: [...images(7), image(8, 15)] });
    const afterDelete = detail({ images: afterUpload.images.filter((item) => item.id !== 1) });
    apiMocks.uploadImage.mockResolvedValue(image(8, 15));
    apiMocks.deleteImage.mockResolvedValue(undefined);
    apiMocks.getOwned.mockResolvedValueOnce(afterUpload).mockResolvedValueOnce(afterDelete);
    render(<Harness initial={initial} />);
    fireEvent.click(screen.getByRole("button", { name: "Thay ảnh 1" }));
    chooseFile(undefined, true);
    fireEvent.click(screen.getByRole("button", { name: "Tải ảnh mới" }));
    await waitFor(() => expect(apiMocks.uploadImage).toHaveBeenCalledOnce());
    await waitFor(() => expect(apiMocks.getOwned).toHaveBeenCalledOnce());
    expect(apiMocks.deleteImage).not.toHaveBeenCalled();
    const deleteOldButton = await screen.findByRole("button", { name: "Xóa ảnh cũ để hoàn tất" });
    await waitFor(() => expect(deleteOldButton).toBeEnabled());
    fireEvent.click(deleteOldButton);
    fireEvent.click(await screen.findByRole("button", { name: "Xác nhận xóa" }));
    await waitFor(() => expect(apiMocks.deleteImage).toHaveBeenCalledOnce());
    await waitFor(() => expect(apiMocks.getOwned).toHaveBeenCalledTimes(2));
  });

  it("replaces at the limit as two explicit delete-then-upload steps without rollback", async () => {
    const initial = detail({ images: images(8) });
    const afterDelete = detail({ status: "PENDING", images: images(8).filter((item) => item.id !== 1) });
    const afterUpload = detail({ status: "PENDING", images: [...afterDelete.images, image(9, 17)] });
    apiMocks.deleteImage.mockResolvedValue(undefined);
    apiMocks.uploadImage.mockResolvedValue(image(9, 17));
    apiMocks.getOwned.mockResolvedValueOnce(afterDelete).mockResolvedValueOnce(afterUpload);
    render(<Harness initial={initial} />);
    fireEvent.click(screen.getByRole("button", { name: "Thay ảnh 1" }));
    chooseFile(undefined, true);
    fireEvent.click(screen.getByRole("button", { name: "Xóa ảnh cũ trước" }));
    expect(apiMocks.uploadImage).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Xác nhận xóa" }));
    await waitFor(() => expect(apiMocks.deleteImage).toHaveBeenCalledOnce());
    await waitFor(() => expect(screen.getByRole("button", { name: "Tải ảnh mới để hoàn tất" })).toBeEnabled());
    expect(apiMocks.uploadImage).not.toHaveBeenCalled();
    expect(screen.getByTestId("canonical")).toHaveTextContent("PENDING:7");
    fireEvent.click(screen.getByRole("button", { name: "Tải ảnh mới để hoàn tất" }));
    await waitFor(() => expect(apiMocks.uploadImage).toHaveBeenCalledOnce());
    await waitFor(() => expect(apiMocks.getOwned).toHaveBeenCalledTimes(2));
  });

  it("keeps both canonical images when the explicit second replacement step fails", async () => {
    const afterUpload = detail({ images: [...images(3), image(4, 8)] });
    apiMocks.uploadImage.mockResolvedValue(image(4, 8));
    apiMocks.deleteImage.mockRejectedValue(backendError(502, "IMAGE_PROVIDER_ERROR"));
    apiMocks.getOwned.mockResolvedValueOnce(afterUpload);
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Thay ảnh 1" }));
    chooseFile(undefined, true);
    fireEvent.click(screen.getByRole("button", { name: "Tải ảnh mới" }));
    await waitFor(() => expect(apiMocks.getOwned).toHaveBeenCalledOnce());
    const deleteOldButton = await screen.findByRole("button", { name: "Xóa ảnh cũ để hoàn tất" });
    await waitFor(() => expect(deleteOldButton).toBeEnabled());
    fireEvent.click(deleteOldButton);
    fireEvent.click(await screen.findByRole("button", { name: "Xác nhận xóa" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Không thể hoàn tất thao tác ảnh");
    expect(screen.getByTestId("canonical")).toHaveTextContent("DRAFT:4");
    expect(apiMocks.deleteImage).toHaveBeenCalledOnce();
  });

  it.each([
    ["APPROVED", "PENDING"],
    ["REJECTED", "DRAFT"],
    ["INACTIVE", "PENDING"],
    ["HIDDEN", "HIDDEN"],
    ["PENDING", "PENDING"],
    ["DRAFT", "DRAFT"]
  ] as const)("uses only refreshed server status after upload: %s -> %s", async (before, after) => {
    apiMocks.uploadImage.mockResolvedValue(image(4, 8));
    apiMocks.getOwned.mockResolvedValue(detail({ status: after, images: [...images(3), image(4, 8)] }));
    render(<Harness initial={detail({ status: before })} />);
    chooseFile();
    upload();
    await waitFor(() => expect(screen.getByTestId("canonical")).toHaveTextContent(`${after}:4`));
  });
});
