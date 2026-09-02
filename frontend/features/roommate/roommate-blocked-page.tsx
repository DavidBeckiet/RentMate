"use client";

import { useEffect, useState } from "react";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Dialog } from "../../components/ui/dialog";
import { EmptyState, ErrorState, LoadingState } from "../../components/ui/feedback-states";
import { Pagination } from "../../components/ui/pagination";
import { api, ApiError } from "../../lib/api/client";
import { useAuth } from "../../lib/auth/auth-provider";
import type { ApiPage, RoommateOwnedBlock } from "../../types/api";
import { formatMemberSince, formatRoommateDateTime, roommateErrorMessage } from "./roommate-content";
import { RoommateAvatar, RoommatePageHeader, RoommateSubnav, RoommateTenantBoundary } from "./roommate-shared";

function actionKey(action: RoommateOwnedBlock["unblockAction"]): string {
  return `${action.kind}:${action.id}`;
}

function BlockedListContent() {
  const { status: authStatus, user } = useAuth();
  const tenantReady = authStatus === "authenticated" && user?.role === "TENANT" && user.isActive;
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<ApiPage<RoommateOwnedBlock> | null>(null);
  const [state, setState] = useState<"loading" | "success" | "error">("loading");
  const [error, setError] = useState<ApiError | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!tenantReady) return;
    const controller = new AbortController();
    setState("loading");
    setError(null);
    void api.roommates
      .listOwnedBlocks({ page, pageSize: 20 }, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) {
          setResult(value);
          setState("success");
        }
      })
      .catch((caught: unknown) => {
        if (!controller.signal.aborted) {
          setError(caught instanceof ApiError ? caught : null);
          setState("error");
        }
      });
    return () => controller.abort();
  }, [page, retryKey, tenantReady]);

  const unblock = async (block: RoommateOwnedBlock) => {
    const key = actionKey(block.unblockAction);
    setPending(key);
    setActionError(null);
    try {
      if (block.unblockAction.kind === "REQUEST") await api.roommates.unblockRequest(block.unblockAction.id);
      else await api.roommates.unblockInterest(block.unblockAction.id);
      const returnToPreviousPage = page > 1 && result?.data.length === 1;
      setResult((current) =>
        current
          ? Object.freeze({
              ...current,
              data: current.data.filter((item) => actionKey(item.unblockAction) !== key)
            })
          : current
      );
      setConfirming(null);
      setSuccess("Đã bỏ chặn. Lời quan tâm hoặc kết nối cũ không được khôi phục.");
      if (returnToPreviousPage) setPage((current) => current - 1);
    } catch (caught) {
      setActionError(roommateErrorMessage(caught));
    } finally {
      setPending(null);
    }
  };

  if (state === "loading") return <LoadingState message="Đang tải danh sách đã chặn…" />;
  if (state === "error") {
    return (
      <ErrorState
        message={roommateErrorMessage(error)}
        requestId={error?.requestId}
        action={<Button onClick={() => setRetryKey((current) => current + 1)}>Thử lại</Button>}
      />
    );
  }

  const blocks = result?.data ?? [];
  return (
    <div className="rm-roommate-page space-y-6">
      <RoommatePageHeader
        title="Đã chặn"
        description="Quản lý các tương tác ở ghép bạn đã chặn. Bỏ chặn không khôi phục lời quan tâm, kết nối hoặc yêu cầu cũ."
      />
      <RoommateSubnav />
      {success ? (
        <p role="status" className="rm-roommate-callout text-ui-sm font-semibold" data-tone="accent">
          {success}
        </p>
      ) : null}
      {actionError ? (
        <p role="alert" className="rm-roommate-callout text-ui-sm font-semibold text-danger" data-tone="danger">
          {actionError}
        </p>
      ) : null}
      {blocks.length === 0 ? (
        <EmptyState
          title="Bạn chưa chặn người dùng nào trong Roommate"
          description="Người bạn chủ động chặn sẽ xuất hiện ở đây để bạn có thể xem lại và bỏ chặn khi cần."
        />
      ) : (
        <div className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            {blocks.map((block) => {
              const key = actionKey(block.unblockAction);
              const memberSince = formatMemberSince(block.counterpart.memberSince);
              const displayName = block.counterpart.displayName ?? "Tài khoản đã chặn";
              return (
                <Card key={key} className="rm-roommate-card-static space-y-4">
                  <div className="flex items-start gap-3">
                    <RoommateAvatar displayName={displayName} />
                    <div className="min-w-0">
                      <p className="rm-roommate-section-label">Tương tác đã chặn</p>
                      <h2 className="mt-1 font-display text-heading-sm font-bold">{displayName}</h2>
                      {memberSince ? (
                        <p className="mt-1 text-ui-xs font-semibold text-muted-foreground">
                          Thành viên từ {memberSince}
                        </p>
                      ) : null}
                      <p className="mt-3 text-ui-sm text-muted-foreground">
                        Đã chặn từ {formatRoommateDateTime(block.blockedAt)}
                      </p>
                    </div>
                  </div>
                  {confirming === key ? (
                    <Dialog
                      open={confirming === key}
                      title="Bỏ chặn thành viên?"
                      description="Việc bỏ chặn không khôi phục các tương tác hoặc kết nối cũ."
                      onClose={() => setConfirming(null)}
                    >
                      <div className="space-y-4">
                        <div className="rm-roommate-callout" data-tone="warning" aria-label="Xác nhận bỏ chặn">
                          <p className="text-ui-sm font-semibold leading-6">
                            Bỏ chặn chỉ cho phép các tương tác tương lai qua một quy trình Roommate mới hợp lệ. Nội dung
                            và kết nối cũ không được khôi phục.
                          </p>
                        </div>
                        <div className="grid gap-2 sm:flex sm:flex-wrap">
                          <Button
                            autoFocus
                            pending={pending === key}
                            pendingLabel="Đang bỏ chặn…"
                            onClick={() => void unblock(block)}
                          >
                            Xác nhận bỏ chặn
                          </Button>
                          <Button variant="secondary" disabled={pending === key} onClick={() => setConfirming(null)}>
                            Hủy
                          </Button>
                        </div>
                      </div>
                    </Dialog>
                  ) : (
                    <Button className="w-full sm:w-auto" variant="outline" onClick={() => setConfirming(key)}>
                      Bỏ chặn
                    </Button>
                  )}
                </Card>
              );
            })}
          </div>
          <Pagination
            ariaLabel="Phân trang tương tác ở ghép đã chặn"
            page={result?.pagination.page ?? page}
            hasNextPage={result?.pagination.hasNextPage ?? false}
            onPrevious={() => setPage((current) => Math.max(1, current - 1))}
            onNext={() => setPage((current) => current + 1)}
          />
        </div>
      )}
    </div>
  );
}

export function RoommateBlockedPage() {
  return (
    <RoommateTenantBoundary>
      <BlockedListContent />
    </RoommateTenantBoundary>
  );
}
