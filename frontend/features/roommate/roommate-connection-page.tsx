"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Dialog } from "../../components/ui/dialog";
import { EmptyState, ErrorState, LoadingState } from "../../components/ui/feedback-states";
import { Icon } from "../../components/ui/icon";
import { buttonClassName } from "../../components/ui/button-styles";
import { api, ApiError } from "../../lib/api/client";
import { useAuth } from "../../lib/auth/auth-provider";
import type { RoommateConnection } from "../../types/api";
import { formatRoommateDateTime, roommateErrorMessage } from "./roommate-content";
import {
  RoommateBlockControl,
  RoommateListingContext,
  RoommatePageHeader,
  RoommateProfileSummary,
  RoommateReportControl,
  RoommateRequestFacts,
  RoommateSafetyNotice,
  RoommateStatusPill,
  RoommateTenantBoundary
} from "./roommate-shared";
import styles from "./roommate-connection.module.css";

function ConnectionContent() {
  const { status: authStatus, user } = useAuth();
  const tenantReady = authStatus === "authenticated" && user?.role === "TENANT" && user.isActive;
  const [connection, setConnection] = useState<RoommateConnection | null>(null);
  const [state, setState] = useState<"loading" | "success" | "empty" | "error">("loading");
  const [error, setError] = useState<ApiError | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [leavePending, setLeavePending] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!tenantReady) return;
    const controller = new AbortController();
    setState("loading");
    setError(null);
    void api.roommates
      .getCurrentConnection(controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) {
          setConnection(value);
          setState("success");
        }
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        const apiError = caught instanceof ApiError ? caught : null;
        if (apiError?.status === 404) {
          setConnection(null);
          setState("empty");
          return;
        }
        setError(apiError);
        setState("error");
      });
    return () => controller.abort();
  }, [retryKey, tenantReady]);

  const leave = async () => {
    if (!connection) return;
    setLeavePending(true);
    setLeaveError(null);
    try {
      await api.roommates.leaveInterest(connection.interestId);
      setConnection(null);
      setState("empty");
      setConfirmLeave(false);
    } catch (caught) {
      setLeaveError(roommateErrorMessage(caught));
    } finally {
      setLeavePending(false);
    }
  };

  return (
    <div className="rm-roommate-page space-y-6">
      <RoommatePageHeader
        title="Kết nối tìm roommate hiện tại"
        description="Kết nối này chỉ giúp hai người tiếp tục trao đổi. RentMate không giữ chỗ, không thu tiền và không bảo đảm giao dịch."
      />
      {state === "loading" ? <LoadingState message="Đang tải kết nối ở ghép…" /> : null}
      {state === "error" ? (
        <ErrorState
          message={roommateErrorMessage(error)}
          requestId={error?.requestId}
          action={<Button onClick={() => setRetryKey((key) => key + 1)}>Thử lại</Button>}
        />
      ) : null}
      {state === "empty" || (state === "success" && !connection) ? (
        <EmptyState
          title="Bạn chưa có kết nối ở ghép hiện tại"
          description="Duyệt yêu cầu đang mở hoặc quản lý các lời quan tâm để bắt đầu khi bạn đã sẵn sàng."
          action={
            <Link className="font-bold underline decoration-2 underline-offset-4" href="/roommates">
              Khám phá yêu cầu
            </Link>
          }
        />
      ) : null}
      {state === "success" && connection ? (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(19rem,0.45fr)]">
          <div className="space-y-5">
            <Card className="rm-roommate-card-static space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="rm-roommate-section-label">Kết nối hiện tại</p>
                  <h2 className="mt-1 font-display text-heading-sm font-bold">Đã kết nối để tìm roommate</h2>
                  <p className="mt-2 text-ui-sm text-rent-secondary">
                    Kết nối từ {formatRoommateDateTime(connection.connectedAt)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <RoommateStatusPill status="ACCEPTED" label="Đang kết nối" />
                  <Link
                    className={buttonClassName("primary", "md", "w-full sm:w-auto")}
                    href={`/roommates/messages?roommate=${connection.interestId}`}
                  >
                    <Icon name="message" className="h-4 w-4" /> Mở trò chuyện
                  </Link>
                </div>
              </div>
              <div className={styles.profileSummary}>
                <RoommateProfileSummary profile={connection.counterpart} heading="Hồ sơ người còn lại" compact />
              </div>
              <RoommateRequestFacts
                request={connection.request}
                showAreas={connection.request.listingMode !== "LINKED"}
              />
              <RoommateListingContext request={connection.request} />
            </Card>
            <div className="space-y-4">
              <RoommateSafetyNotice kind="short" />
              <details className="rm-roommate-card-static rounded-card border border-border bg-surface p-4 shadow-surface">
                <summary className="min-h-11 cursor-pointer py-2 text-ui-sm font-bold text-foreground">
                  Xem hướng dẫn an toàn đầy đủ
                </summary>
                <div className="mt-4 space-y-4">
                  <RoommateSafetyNotice kind="long" />
                  <RoommateSafetyNotice kind="checklist" />
                </div>
              </details>
            </div>
            <Card className="rm-roommate-card-static space-y-3" aria-label="Kết thúc kết nối ở ghép">
              <h2 className="font-display text-ui-base font-bold">Kết thúc kết nối</h2>
              <p className="text-ui-sm leading-6 text-muted-foreground">
                Kết thúc kết nối không mở lại yêu cầu hoặc lời quan tâm cũ. Nếu muốn tìm tiếp, bạn cần bắt đầu một quy
                trình Roommate mới hợp lệ sau khi kết nối hiện tại đã kết thúc.
              </p>
              {leaveError && !confirmLeave ? (
                <p role="alert" className="rm-roommate-callout text-ui-sm font-semibold text-danger" data-tone="danger">
                  {leaveError}
                </p>
              ) : null}
              {confirmLeave ? (
                <Dialog
                  open={confirmLeave}
                  title="Kết thúc kết nối?"
                  description="Hãy xác nhận khi bạn chắc chắn muốn đóng kết nối hiện tại."
                  onClose={() => setConfirmLeave(false)}
                >
                  <div className="space-y-4">
                    <div className="rm-roommate-callout" data-tone="warning">
                      <p className="text-ui-sm font-semibold leading-6">
                        Kết nối này sẽ kết thúc. Yêu cầu và lời quan tâm cũ không được mở lại hoặc khôi phục; hai bên
                        chỉ có thể tương tác lại qua một quy trình Roommate mới hợp lệ.
                      </p>
                    </div>
                    {leaveError ? (
                      <p
                        role="alert"
                        className="rm-roommate-callout text-ui-sm font-semibold text-danger"
                        data-tone="danger"
                      >
                        {leaveError}
                      </p>
                    ) : null}
                    <div className="grid gap-2 sm:flex sm:flex-wrap">
                      <Button
                        autoFocus
                        variant="danger"
                        pending={leavePending}
                        pendingLabel="Đang kết thúc…"
                        onClick={() => void leave()}
                      >
                        Xác nhận kết thúc
                      </Button>
                      <Button variant="secondary" disabled={leavePending} onClick={() => setConfirmLeave(false)}>
                        Quay lại
                      </Button>
                    </div>
                  </div>
                </Dialog>
              ) : (
                <Button className="w-full sm:w-auto" variant="outline" onClick={() => setConfirmLeave(true)}>
                  Kết thúc kết nối
                </Button>
              )}
            </Card>
          </div>
          <aside className="space-y-4" aria-label="Thao tác an toàn">
            <RoommateBlockControl
              context="interest"
              id={connection.interestId}
              onBlocked={() => setRetryKey((key) => key + 1)}
            />
            <RoommateReportControl target="ROOMMATE_PROFILE" interestId={connection.interestId} label="Báo cáo" />
            <Card subtle className="rm-roommate-card-static">
              <h2 className="font-display text-ui-base font-bold">Thông tin riêng tư</h2>
              <p className="mt-2 text-ui-sm leading-6 text-muted-foreground">
                Kết nối không tự động chia sẻ email, số điện thoại, địa chỉ chính xác hoặc dữ liệu tài chính.
              </p>
            </Card>
          </aside>
        </div>
      ) : null}
    </div>
  );
}

export function RoommateConnectionPage() {
  return (
    <RoommateTenantBoundary>
      <ConnectionContent />
    </RoommateTenantBoundary>
  );
}
