"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "../../components/ui/button";
import { InputField } from "../../components/ui/form-controls";
import { api, ApiError } from "../../lib/api/client";
import { useAuth } from "../../lib/auth/auth-provider";
import type { OwnerImage, OwnerListingDetail } from "../../types/api";

const maximumImageBytes = 5_242_880;
const maximumAltTextCodePoints = 255;
const maximumImageCount = 8;
const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

type PendingAction = "upload" | "delete" | "reorder" | "refresh";

interface ImageFeedback {
  readonly kind: "error" | "success" | "info";
  readonly message: string;
  readonly requestId?: string | null;
}

interface ReplacementState {
  readonly targetId: number;
  readonly file: File | null;
  readonly altText: string;
  readonly phase: "choose" | "delete-old" | "upload-new";
}

interface DeleteConfirmation {
  readonly imageId: number;
  readonly replacement: boolean;
}

export interface OwnerImageManagerProps {
  readonly detail: OwnerListingDetail;
  readonly contentBlocked: boolean;
  readonly onCanonicalChange: (detail: OwnerListingDetail) => void;
  readonly onBusyChange: (busy: boolean) => void;
  readonly onOrderDirtyChange: (dirty: boolean) => void;
}

function sortImages(images: readonly OwnerImage[]): readonly OwnerImage[] {
  return [...images].sort((left, right) => left.displayOrder - right.displayOrder || left.id - right.id);
}

function orderIds(images: readonly OwnerImage[]): readonly number[] {
  return images.map((image) => image.id);
}

function sameOrder(left: readonly number[], right: readonly number[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

function imageSignature(images: readonly OwnerImage[]): string {
  return sortImages(images)
    .map((image) => `${image.id}:${image.displayOrder}`)
    .join("|");
}

function validateUpload(file: File | null, altText: string): string | null {
  if (!file) return "Hãy chọn một ảnh để tải lên.";
  if (file.size > maximumImageBytes) return "Ảnh vượt quá giới hạn 5 MiB.";
  if (!allowedImageTypes.has(file.type)) return "Ảnh phải là JPEG, PNG hoặc WebP hợp lệ.";
  if ([...altText.trim()].length > maximumAltTextCodePoints) return "Mô tả ảnh không được vượt quá 255 ký tự.";
  return null;
}

function mutationError(error: unknown, operation: "upload" | "delete" | "reorder"): ImageFeedback {
  if (!(error instanceof ApiError)) {
    return { kind: "error", message: "Không thể hoàn tất thao tác ảnh lúc này." };
  }
  if (error.status === 401) {
    return { kind: "error", message: "Phiên đăng nhập không còn hợp lệ. Vui lòng đăng nhập lại." };
  }
  if (error.status === 403) {
    return { kind: "error", message: "Bạn không có quyền quản lý ảnh của tin này.", requestId: error.requestId };
  }
  if (error.status === 404) {
    return { kind: "error", message: "Tin hoặc ảnh không tồn tại hay bạn không thể truy cập." };
  }
  if (operation === "upload" && error.status === 413) {
    return { kind: "error", message: "Ảnh vượt quá giới hạn 5 MiB.", requestId: error.requestId };
  }
  if (operation === "upload" && error.status === 415) {
    return { kind: "error", message: "Ảnh phải là JPEG, PNG hoặc WebP hợp lệ.", requestId: error.requestId };
  }
  if (operation === "upload" && error.code === "IMAGE_LIMIT_EXCEEDED") {
    return { kind: "error", message: "Đã đạt giới hạn 8 ảnh.", requestId: error.requestId };
  }
  if (operation === "delete" && error.code === "LAST_IMAGE_REQUIRED") {
    return {
      kind: "error",
      message: "Tin không phải bản nháp phải giữ ít nhất một ảnh.",
      requestId: error.requestId
    };
  }
  if (operation === "reorder" && error.status === 409) {
    return {
      kind: "error",
      message: "Danh sách ảnh đã thay đổi. Hãy tải lại tin trước khi sắp xếp lại.",
      requestId: error.requestId
    };
  }
  if (error.status === 502) {
    return {
      kind: "error",
      message:
        operation === "upload"
          ? "Dịch vụ lưu ảnh tạm thời không khả dụng."
          : "Không thể hoàn tất thao tác ảnh lúc này.",
      requestId: error.requestId
    };
  }
  return { kind: "error", message: "Không thể hoàn tất thao tác ảnh lúc này.", requestId: error.requestId };
}

function significantEditWarning(status: OwnerListingDetail["status"]): string | null {
  if (status === "APPROVED") return "Thêm hoặc xóa ảnh có thể đưa tin về trạng thái chờ duyệt.";
  if (status === "INACTIVE") return "Thêm hoặc xóa ảnh có thể thay đổi trạng thái hiện tại của tin.";
  if (status === "REJECTED") return "Thêm hoặc xóa ảnh là một chỉnh sửa đáng kể đối với tin bị từ chối.";
  if (status === "HIDDEN") return "Thêm hoặc xóa ảnh không tự công khai hay gửi duyệt lại tin đang bị ẩn.";
  return null;
}

export function OwnerImageManager({
  detail,
  contentBlocked,
  onCanonicalChange,
  onBusyChange,
  onOrderDirtyChange
}: OwnerImageManagerProps) {
  const { refresh } = useAuth();
  const canonicalImages = useMemo(() => sortImages(detail.images), [detail.images]);
  const canonicalSignature = imageSignature(detail.images);
  const [proposedImages, setProposedImages] = useState<readonly OwnerImage[]>(canonicalImages);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [altText, setAltText] = useState("");
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [feedback, setFeedback] = useState<ImageFeedback | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<DeleteConfirmation | null>(null);
  const [replacement, setReplacement] = useState<ReplacementState | null>(null);
  const [recoveryRequired, setRecoveryRequired] = useState(false);
  const pendingRef = useRef(false);
  const controllerRef = useRef<AbortController | null>(null);
  const syncedSignatureRef = useRef(canonicalSignature);
  const canonicalIds = orderIds(canonicalImages);
  const proposedIds = orderIds(proposedImages);
  const orderDirty = !sameOrder(canonicalIds, proposedIds);
  const busy = pendingAction !== null;
  const mutationBlocked = contentBlocked || orderDirty || busy || recoveryRequired;
  const warning = significantEditWarning(detail.status);

  useEffect(() => {
    if (syncedSignatureRef.current === canonicalSignature) return;
    syncedSignatureRef.current = canonicalSignature;
    setProposedImages(canonicalImages);
  }, [canonicalImages, canonicalSignature]);

  useEffect(() => onBusyChange(busy), [busy, onBusyChange]);
  useEffect(() => onOrderDirtyChange(orderDirty), [onOrderDirtyChange, orderDirty]);
  useEffect(
    () => () => {
      controllerRef.current?.abort();
      onBusyChange(false);
      onOrderDirtyChange(false);
    },
    [onBusyChange, onOrderDirtyChange]
  );

  const refreshCanonical = async (controller: AbortController): Promise<OwnerListingDetail> => {
    const returned = await api.listings.getOwned(detail.id, controller.signal);
    if (!controller.signal.aborted) onCanonicalChange(returned);
    return returned;
  };

  const runOperation = async (
    action: PendingAction,
    operation: (controller: AbortController) => Promise<void>,
    onError: (error: unknown, controller: AbortController) => Promise<void> | void
  ) => {
    if (pendingRef.current) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    pendingRef.current = true;
    setPendingAction(action);
    setFeedback(null);
    try {
      await operation(controller);
    } catch (caught: unknown) {
      if (!controller.signal.aborted) {
        await onError(caught, controller);
        if (caught instanceof ApiError && caught.status === 401) await refresh().catch(() => undefined);
      }
    } finally {
      if (!controller.signal.aborted && controllerRef.current === controller) {
        pendingRef.current = false;
        setPendingAction(null);
      }
    }
  };

  const handleAmbiguousMutation = (operation: "upload" | "delete") => {
    setRecoveryRequired(true);
    setSelectedFile(null);
    setReplacement(null);
    setConfirmingDelete(null);
    setFeedback({
      kind: "error",
      message:
        operation === "upload"
          ? "Không thể xác nhận ảnh đã được tải lên. Hãy tải lại tin để kiểm tra trước khi thử lại."
          : "Không thể xác nhận ảnh đã được xóa. Hãy tải lại tin để kiểm tra."
    });
  };

  const reloadCanonical = () => {
    void runOperation(
      "refresh",
      async (controller) => {
        await refreshCanonical(controller);
        if (controller.signal.aborted) return;
        setRecoveryRequired(false);
        setReplacement(null);
        setConfirmingDelete(null);
        setSelectedFile(null);
        setAltText("");
        setFeedback({ kind: "success", message: "Đã tải lại trạng thái ảnh của tin." });
      },
      (error) => setFeedback(mutationError(error, "reorder"))
    );
  };

  const upload = (file: File | null, description: string, replacementMode: boolean) => {
    const validation = validateUpload(file, description);
    if (validation) {
      setFeedback({ kind: "error", message: validation });
      return;
    }
    if (!file || mutationBlocked) return;
    const normalizedAltText = description.trim();
    void runOperation(
      "upload",
      async (controller) => {
        await api.listings.uploadImage(
          detail.id,
          { image: file, ...(normalizedAltText ? { altText: normalizedAltText } : {}) },
          controller.signal
        );
        const returned = await refreshCanonical(controller);
        if (controller.signal.aborted) return;
        if (replacementMode && replacement) {
          if (replacement.phase === "upload-new") {
            setReplacement(null);
            setFeedback({ kind: "success", message: "Đã tải ảnh mới và hoàn tất các bước thay ảnh." });
          } else if (returned.images.some((image) => image.id === replacement.targetId)) {
            setReplacement({ ...replacement, phase: "delete-old" });
            setFeedback({ kind: "info", message: "Ảnh mới đã được tải lên. Xóa ảnh cũ để hoàn tất." });
          } else {
            setReplacement(null);
            setFeedback({ kind: "info", message: "Danh sách ảnh đã thay đổi. Hãy kiểm tra trạng thái hiện tại." });
          }
        } else {
          setSelectedFile(null);
          setAltText("");
          setFeedback({ kind: "success", message: "Đã tải ảnh lên và đồng bộ trạng thái tin." });
        }
      },
      async (error, controller) => {
        if (error instanceof ApiError && error.code === "NETWORK_ERROR") {
          handleAmbiguousMutation("upload");
          return;
        }
        if (error instanceof ApiError && error.code === "IMAGE_LIMIT_EXCEEDED") {
          await refreshCanonical(controller).catch(() => undefined);
        }
        setFeedback(mutationError(error, "upload"));
      }
    );
  };

  const requestDelete = (imageId: number, replacementMode: boolean) => {
    if (mutationBlocked) return;
    setConfirmingDelete({ imageId, replacement: replacementMode });
    setFeedback(null);
  };

  const confirmDelete = () => {
    const confirmation = confirmingDelete;
    if (!confirmation || mutationBlocked) return;
    void runOperation(
      "delete",
      async (controller) => {
        await api.listings.deleteImage(detail.id, confirmation.imageId, controller.signal);
        const returned = await refreshCanonical(controller);
        if (controller.signal.aborted) return;
        setConfirmingDelete(null);
        if (confirmation.replacement && replacement) {
          if (replacement.phase === "choose") {
            setReplacement({ ...replacement, phase: "upload-new" });
            setFeedback({ kind: "info", message: "Ảnh cũ đã được xóa. Tải ảnh mới để hoàn tất." });
          } else {
            setReplacement(null);
            setFeedback({ kind: "success", message: "Đã xóa ảnh cũ và hoàn tất các bước thay ảnh." });
          }
        } else {
          setFeedback({ kind: "success", message: "Đã xóa ảnh và đồng bộ trạng thái tin." });
        }
        if (returned.images.length === 0) setProposedImages([]);
      },
      async (error, controller) => {
        if (error instanceof ApiError && error.code === "NETWORK_ERROR") {
          handleAmbiguousMutation("delete");
          return;
        }
        if (error instanceof ApiError && error.code === "LAST_IMAGE_REQUIRED") {
          await refreshCanonical(controller).catch(() => undefined);
        }
        setFeedback(mutationError(error, "delete"));
      }
    );
  };

  const moveImage = (index: number, direction: -1 | 1) => {
    if (contentBlocked || busy || recoveryRequired) return;
    const target = index + direction;
    if (target < 0 || target >= proposedImages.length) return;
    const next = [...proposedImages];
    [next[index], next[target]] = [next[target]!, next[index]!];
    setProposedImages(next);
    setFeedback(null);
  };

  const saveOrder = () => {
    if (contentBlocked || busy || recoveryRequired) return;
    if (!orderDirty) {
      setFeedback({ kind: "info", message: "Thứ tự ảnh không thay đổi." });
      return;
    }
    void runOperation(
      "reorder",
      async (controller) => {
        await api.listings.reorderImages(detail.id, { imageIds: proposedIds }, controller.signal);
        await refreshCanonical(controller);
        if (!controller.signal.aborted) setFeedback({ kind: "success", message: "Đã lưu thứ tự ảnh." });
      },
      async (error, controller) => {
        if (error instanceof ApiError && error.status === 409) {
          await refreshCanonical(controller).catch(() => undefined);
        }
        setFeedback(mutationError(error, "reorder"));
      }
    );
  };

  const beginReplacement = (imageId: number) => {
    if (mutationBlocked) return;
    setReplacement({ targetId: imageId, file: null, altText: "", phase: "choose" });
    setConfirmingDelete(null);
    setFeedback(null);
  };

  const startReplacementStep = () => {
    if (!replacement || mutationBlocked) return;
    const validation = validateUpload(replacement.file, replacement.altText);
    if (validation) {
      setFeedback({ kind: "error", message: validation });
      return;
    }
    if (replacement.phase === "upload-new") {
      upload(replacement.file, replacement.altText, true);
      return;
    }
    if (canonicalImages.length >= maximumImageCount) {
      requestDelete(replacement.targetId, true);
      return;
    }
    upload(replacement.file, replacement.altText, true);
  };

  const replacementTarget = replacement
    ? (canonicalImages.find((image) => image.id === replacement.targetId) ?? null)
    : null;

  return (
    <section
      aria-labelledby="owner-images-heading"
      className="rm-workspace-panel space-y-6 p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="owner-images-heading" className="text-xl font-semibold text-rent-ink">
            Ảnh của tin
          </h2>
          <p className="mt-1 text-sm text-rent-secondary">
            {canonicalImages.length}/{maximumImageCount} ảnh · ảnh đầu tiên là ảnh bìa
          </p>
        </div>
        {warning ? <p className="max-w-xl text-sm text-amber-900">{warning}</p> : null}
      </div>

      {contentBlocked ? (
        <p className="rounded-control border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          Hãy lưu hoặc hoàn tác thay đổi nội dung trước khi quản lý ảnh.
        </p>
      ) : null}

      {feedback ? (
        <div
          role={feedback.kind === "error" ? "alert" : "status"}
          className={`rounded-control border p-4 text-sm ${
            feedback.kind === "error"
              ? "border-red-200 bg-red-50 text-red-950"
              : feedback.kind === "success"
                ? "border-teal-200 bg-teal-50 text-teal-950"
                : "border-sky-200 bg-sky-50 text-sky-950"
          }`}
        >
          <p>
            {feedback.message}
            {feedback.requestId ? ` Mã yêu cầu: ${feedback.requestId}` : ""}
          </p>
          {recoveryRequired ? (
            <Button
              className="mt-3"
              variant="secondary"
              pending={pendingAction === "refresh"}
              onClick={reloadCanonical}
            >
              Tải lại tin
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="space-y-4 rounded-control border border-dashed border-teal-300 bg-rent-primary-subtle/50 p-5">
        <h3 className="font-semibold text-rent-ink">Thêm ảnh</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label htmlFor="owner-image-file" className="block text-sm font-medium text-slate-900">
              Chọn một ảnh
            </label>
            <input
              id="owner-image-file"
              name="image"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={mutationBlocked || canonicalImages.length >= maximumImageCount}
              aria-describedby="owner-image-file-hint"
              className="block min-h-11 w-full rounded-control border border-rent-line bg-white px-3 py-2 text-sm text-rent-ink file:mr-3 file:rounded file:border-0 file:bg-teal-700 file:px-3 file:py-2 file:font-semibold file:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
              onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
            />
            <p id="owner-image-file-hint" className="text-xs text-slate-600">
              JPEG, PNG hoặc WebP; tối đa 5 MiB. Kiểm tra trình duyệt không thay thế kiểm tra nội dung của máy chủ.
            </p>
            {selectedFile ? <p className="text-sm text-slate-700">Đã chọn: {selectedFile.name}</p> : null}
          </div>
          <InputField
            id="owner-image-alt"
            name="altText"
            label="Mô tả ảnh (không bắt buộc)"
            maxLength={255}
            value={altText}
            disabled={mutationBlocked || canonicalImages.length >= maximumImageCount}
            onChange={(event) => setAltText(event.target.value)}
          />
        </div>
        {canonicalImages.length >= maximumImageCount ? (
          <p className="text-sm text-amber-900">Đã đạt giới hạn 8 ảnh. Hãy dùng quy trình thay ảnh nếu cần.</p>
        ) : null}
        <Button
          pending={pendingAction === "upload" && !replacement}
          pendingLabel="Đang tải ảnh…"
          disabled={mutationBlocked || canonicalImages.length >= maximumImageCount || !selectedFile}
          onClick={() => upload(selectedFile, altText, false)}
        >
          Tải ảnh lên
        </Button>
      </div>

      {proposedImages.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {proposedImages.map((image, index) => {
            const deleteForbidden = detail.status !== "DRAFT" && canonicalImages.length === 1;
            const isConfirming = confirmingDelete?.imageId === image.id && !confirmingDelete.replacement;
            return (
              <article key={image.id} className="group space-y-3 rounded-control border border-rent-line bg-white p-3 transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-teal-300 hover:shadow-card-hover">
                <div className="relative aspect-[4/3] overflow-hidden rounded-control bg-rent-surface-muted">
                  <Image
                    src={image.url}
                    alt={image.altText ?? `Ảnh ${index + 1} của ${detail.title ?? "tin đăng"}`}
                    fill
                    sizes="(min-width: 1024px) 320px, (min-width: 640px) 50vw, 100vw"
                    className="object-cover"
                  />
                </div>
                <div className="text-sm text-rent-secondary">
                  <p className="font-semibold text-rent-ink">{index === 0 ? "Ảnh bìa" : `Ảnh ${index + 1}`}</p>
                  <p>Vị trí đã lưu: {image.displayOrder}</p>
                  {image.altText ? <p className="mt-1">{image.altText}</p> : null}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="secondary"
                    aria-label={`Đưa ảnh ${index + 1} lên`}
                    disabled={index === 0 || contentBlocked || busy || recoveryRequired}
                    onClick={() => moveImage(index, -1)}
                  >
                    Đưa lên
                  </Button>
                  <Button
                    variant="secondary"
                    aria-label={`Đưa ảnh ${index + 1} xuống`}
                    disabled={index === proposedImages.length - 1 || contentBlocked || busy || recoveryRequired}
                    onClick={() => moveImage(index, 1)}
                  >
                    Đưa xuống
                  </Button>
                  <Button
                    variant="secondary"
                    aria-label={`Thay ảnh ${index + 1}`}
                    disabled={mutationBlocked || replacement !== null}
                    onClick={() => beginReplacement(image.id)}
                  >
                    Thay ảnh
                  </Button>
                  <Button
                    variant="danger"
                    aria-label={`Xóa ảnh ${index + 1}`}
                    disabled={mutationBlocked || deleteForbidden}
                    onClick={() => requestDelete(image.id, false)}
                  >
                    Xóa ảnh
                  </Button>
                </div>
                {deleteForbidden ? (
                  <p className="text-xs text-amber-900">Tin không phải bản nháp phải giữ ít nhất một ảnh.</p>
                ) : null}
                {isConfirming ? (
                    <div className="space-y-2 rounded-control border border-red-200 bg-red-50 p-3">
                    <p className="text-sm font-semibold text-red-950">Xóa ảnh này?</p>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="danger" pending={pendingAction === "delete"} onClick={confirmDelete}>
                        Xác nhận
                      </Button>
                      <Button variant="secondary" disabled={busy} onClick={() => setConfirmingDelete(null)}>
                        Hủy
                      </Button>
                    </div>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          Cần ít nhất một ảnh trước khi gửi duyệt.
        </p>
      )}

      <div className="flex flex-wrap gap-3 border-t border-rent-line pt-4">
        <Button
          variant="secondary"
          pending={pendingAction === "reorder"}
          pendingLabel="Đang lưu thứ tự…"
          disabled={contentBlocked || busy || recoveryRequired || proposedImages.length === 0}
          onClick={saveOrder}
        >
          Lưu thứ tự ảnh
        </Button>
        <Button
          variant="secondary"
          disabled={!orderDirty || contentBlocked || busy || recoveryRequired}
          onClick={() => {
            setProposedImages(canonicalImages);
            setFeedback({ kind: "info", message: "Đã hoàn tác thứ tự ảnh." });
          }}
        >
          Hoàn tác thứ tự
        </Button>
        <p className="self-center text-sm text-slate-600">Đổi thứ tự ảnh không làm thay đổi trạng thái duyệt.</p>
      </div>

      {replacement ? (
        <div className="space-y-4 rounded-control border border-sky-200 bg-sky-50 p-4">
          <div>
            <h3 className="font-semibold text-sky-950">Thay ảnh</h3>
            <p className="mt-1 text-sm text-sky-950">
              Thay ảnh gồm nhiều bước. Nếu bước sau lỗi, thay đổi của bước trước vẫn được giữ.
            </p>
          </div>
          {replacementTarget || replacement.phase === "upload-new" ? (
            <>
              {replacement.phase === "delete-old" ? (
                <p className="text-sm text-sky-950">Bước 2/2: xóa ảnh cũ để hoàn tất.</p>
              ) : replacement.phase === "upload-new" ? (
                <p className="text-sm text-sky-950">Bước 2/2: tải ảnh mới để hoàn tất.</p>
              ) : canonicalImages.length >= maximumImageCount ? (
                <p className="text-sm text-sky-950">Bước 1/2: phải xóa ảnh cũ trước vì tin đang có đủ 8 ảnh.</p>
              ) : (
                <p className="text-sm text-sky-950">Bước 1/2: tải ảnh mới trước, sau đó xóa ảnh cũ.</p>
              )}

              {replacement.phase !== "delete-old" ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label htmlFor="owner-replacement-file" className="block text-sm font-medium text-slate-900">
                      Ảnh mới
                    </label>
                    <input
                      id="owner-replacement-file"
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      disabled={busy || contentBlocked || recoveryRequired}
                      className="block min-h-11 w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:ring-offset-2 disabled:opacity-60"
                      onChange={(event) =>
                        setReplacement((current) =>
                          current ? { ...current, file: event.target.files?.[0] ?? null } : current
                        )
                      }
                    />
                    {replacement.file ? (
                      <p className="text-sm text-slate-700">Đã chọn: {replacement.file.name}</p>
                    ) : null}
                  </div>
                  <InputField
                    id="owner-replacement-alt"
                    name="replacementAltText"
                    label="Mô tả ảnh mới (không bắt buộc)"
                    maxLength={255}
                    value={replacement.altText}
                    disabled={busy || contentBlocked || recoveryRequired}
                    onChange={(event) =>
                      setReplacement((current) => (current ? { ...current, altText: event.target.value } : current))
                    }
                  />
                </div>
              ) : null}

              {confirmingDelete?.replacement ? (
                <div className="space-y-2 rounded-lg border border-red-200 bg-white p-3">
                  <p className="text-sm font-semibold text-red-950">Xóa ảnh cũ trong bước này?</p>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="danger" pending={pendingAction === "delete"} onClick={confirmDelete}>
                      Xác nhận xóa
                    </Button>
                    <Button variant="secondary" disabled={busy} onClick={() => setConfirmingDelete(null)}>
                      Hủy
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <Button
                    pending={pendingAction === "upload" || pendingAction === "delete"}
                    disabled={mutationBlocked || (replacement.phase !== "delete-old" && !replacement.file)}
                    onClick={() =>
                      replacement.phase === "delete-old"
                        ? requestDelete(replacement.targetId, true)
                        : startReplacementStep()
                    }
                  >
                    {replacement.phase === "delete-old"
                      ? "Xóa ảnh cũ để hoàn tất"
                      : replacement.phase === "upload-new"
                        ? "Tải ảnh mới để hoàn tất"
                        : canonicalImages.length >= maximumImageCount
                          ? "Xóa ảnh cũ trước"
                          : "Tải ảnh mới"}
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() => {
                      setReplacement(null);
                      setConfirmingDelete(null);
                    }}
                  >
                    Dừng thay ảnh
                  </Button>
                </div>
              )}
            </>
          ) : (
            <p role="alert" className="text-sm text-red-900">
              Ảnh cũ không còn trong danh sách hiện tại. Hãy tải lại tin để kiểm tra.
            </p>
          )}
        </div>
      ) : null}
    </section>
  );
}
