"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { EmptyState, ErrorState, LoadingState } from "../../components/ui/feedback-states";
import { Icon } from "../../components/ui/icon";
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
  RoommateSafetyNotice,
  RoommateSubnav,
  RoommateTenantBoundary
} from "./roommate-shared";

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

  if (state === "loading") return <LoadingState message="Đang tải kết nối ở ghép…" />;
  if (state === "error")
    return (
      <ErrorState
        message={roommateErrorMessage(error)}
        requestId={error?.requestId}
        action={<Button onClick={() => setRetryKey((key) => key + 1)}>Thử lại</Button>}
      />
    );

  return (
    <div className="space-y-6">
      <RoommatePageHeader
        title="Kết nối ở ghép hiện tại"
        description="Kết nối này chỉ giúp hai người tiếp tục trao đổi. RentMate không giữ chỗ, không thu tiền và không bảo đảm giao dịch."
      />
      <RoommateSubnav />
      {state === "empty" || !connection ? (
        <EmptyState
          title="Bạn chưa có kết nối ở ghép hiện tại"
          description="Duyệt yêu cầu đang mở hoặc quản lý các lời quan tâm để bắt đầu khi bạn đã sẵn sàng."
          action={
            <Link className="font-bold underline decoration-2 underline-offset-4" href="/roommates">
              Khám phá yêu cầu
            </Link>
          }
        />
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(19rem,0.45fr)]">
          <div className="space-y-5">
            <Card className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-ui-xs font-bold uppercase tracking-[0.12em] text-rent-secondary">
                    KẾT NỐI HIỆN TẠI
                  </p>
                  <h2 className="mt-1 font-display text-heading-sm font-bold">Đang trao đổi</h2>
                  <p className="mt-2 text-ui-sm text-rent-secondary">
                    Kết nối từ {formatRoommateDateTime(connection.connectedAt)}
                  </p>
                </div>
                <Link
                  className="inline-flex min-h-11 items-center border-2 border-heroDark-950 bg-heroDark-950 px-4 text-ui-sm font-bold text-white shadow-glass-sm"
                  href={`/roommates/conversations/${connection.interestId}`}
                >
                  <Icon name="message" className="h-4 w-4" /> Mở trò chuyện
                </Link>
              </div>
              <RoommateProfileSummary profile={connection.counterpart} heading="Hồ sơ người còn lại" />
              <RoommateListingContext request={connection.request} />
            </Card>
            <RoommateSafetyNotice kind="long" />
            <RoommateSafetyNotice kind="checklist" />
            <Card className="space-y-3" aria-label="Kết thúc kết nối ở ghép">
              <h2 className="font-display text-ui-base font-bold">Kết thúc kết nối</h2>
              <p className="text-ui-sm leading-6 text-rent-secondary">
                Kết thúc kết nối không mở lại yêu cầu cũ. Nếu muốn tìm tiếp, bạn có thể tạo một yêu cầu mới khi không
                còn commitment đang hoạt động.
              </p>
              {confirmLeave ? (
                <div className="space-y-3 border-2 border-heroDark-950 bg-rent-coral p-4">
                  <p className="text-ui-sm font-semibold">Bạn có chắc muốn kết thúc kết nối này?</p>
                  {leaveError ? (
                    <p role="alert" className="border-l-4 border-rose-700 pl-3 text-ui-sm font-semibold text-rose-800">
                      {leaveError}
                    </p>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    <Button
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
              ) : (
                <Button variant="outline" onClick={() => setConfirmLeave(true)}>
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
            <Card subtle>
              <h2 className="font-display text-ui-base font-bold">Thông tin riêng tư</h2>
              <p className="mt-2 text-ui-sm leading-6 text-rent-secondary">
                Kết nối không tự động chia sẻ email, số điện thoại, địa chỉ chính xác hoặc dữ liệu tài chính.
              </p>
            </Card>
          </aside>
        </div>
      )}
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
