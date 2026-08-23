"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "../../components/ui/button";
import { EmptyState, ErrorState, LoadingState } from "../../components/ui/feedback-states";
import { Icon } from "../../components/ui/icon";
import { Pagination } from "../../components/ui/pagination";
import { api, ApiError } from "../../lib/api/client";
import { useAuth } from "../../lib/auth/auth-provider";
import type { AdminLandlordVerification, ApiPage, VerificationStatus } from "../../types/api";
import styles from "./admin-verifications-page.module.css";

const statuses: readonly VerificationStatus[] = ["PENDING", "APPROVED", "REJECTED"];
const statusLabels: Record<VerificationStatus, string> = {
  PENDING: "Chờ duyệt",
  APPROVED: "Đã xác minh",
  REJECTED: "Đã từ chối"
};

export function AdminVerificationsPage() {
  const { status: authStatus, user, error: authError, refresh } = useAuth();
  const adminReady = authStatus === "authenticated" && user?.role === "ADMIN";
  const [statusFilter, setStatusFilter] = useState<VerificationStatus>("PENDING");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<ApiPage<AdminLandlordVerification> | null>(null);
  const [loadState, setLoadState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [selected, setSelected] = useState<AdminLandlordVerification | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [note, setNote] = useState("");
  const [actionPending, setActionPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (!adminReady) return;
    const controller = new AbortController();
    setLoadState("loading");
    setSelected(null);
    setMessage(null);
    void api.admin
      .listVerifications({ status: statusFilter, page, pageSize: 20 }, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) {
          setResult(data);
          setLoadState("success");
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoadState("error");
      });
    return () => controller.abort();
  }, [adminReady, page, retryKey, statusFilter]);

  const openDetail = async (verificationId: number) => {
    setDetailLoading(true);
    setMessage(null);
    setNote("");
    try {
      setSelected(await api.admin.getVerification(verificationId));
    } catch {
      setMessage("Không thể tải chi tiết yêu cầu xác minh.");
    } finally {
      setDetailLoading(false);
    }
  };

  const decide = async (status: "APPROVED" | "REJECTED") => {
    if (!selected) return;
    if (!note.trim()) {
      setMessage("Cần nhập ghi chú quyết định.");
      return;
    }
    setActionPending(true);
    setMessage(null);
    try {
      setSelected(await api.admin.reviewVerification(selected.id, { status, note: note.trim() }));
      setNote("");
      setRetryKey((value) => value + 1);
    } catch (caught) {
      const apiError = caught instanceof ApiError ? caught : null;
      setMessage(
        apiError?.status === 409
          ? "Yêu cầu đã được xử lý bởi một quản trị viên khác."
          : "Chưa thể lưu quyết định xác minh."
      );
    } finally {
      setActionPending(false);
    }
  };

  if (authStatus === "loading") return <LoadingState message="Đang kiểm tra tài khoản…" />;
  if (authStatus === "anonymous") {
    return (
      <ErrorState
        message="Bạn cần đăng nhập bằng tài khoản quản trị viên."
        action={<Link href="/admin/login">Đăng nhập quản trị</Link>}
      />
    );
  }
  if (authStatus === "error") {
    return (
      <ErrorState
        message="Không thể kiểm tra tài khoản."
        requestId={authError?.requestId}
        action={<Button onClick={() => void refresh()}>Thử lại</Button>}
      />
    );
  }
  if (!adminReady) return <ErrorState message="Trang này dành cho quản trị viên." />;

  return (
    <section className={styles.page} aria-labelledby="verifications-heading">
      <header className={styles.header}>
        <span>
          <Icon name="shield" className="h-4 w-4" /> Identity review
        </span>
        <h1 id="verifications-heading">
          Xác minh <em>chủ trọ</em>
        </h1>
        <p>Duyệt thủ công hồ sơ và thông tin liên hệ hiện có. Không thu giấy tờ và không coi đây là eKYC.</p>
      </header>
      <div className={styles.workspace}>
        <label className={styles.filter}>
          Trạng thái
          <select
            value={statusFilter}
            onChange={(event) => {
              setStatusFilter(event.target.value as VerificationStatus);
              setPage(1);
            }}
          >
            {statuses.map((status) => (
              <option key={status} value={status}>
                {statusLabels[status]}
              </option>
            ))}
          </select>
        </label>

        {loadState === "loading" || loadState === "idle" ? <LoadingState message="Đang tải yêu cầu xác minh…" /> : null}
        {loadState === "error" ? (
          <ErrorState
            message="Không thể tải hàng đợi xác minh."
            action={<Button onClick={() => setRetryKey((value) => value + 1)}>Thử lại</Button>}
          />
        ) : null}
        {loadState === "success" && result?.data.length === 0 ? (
          <EmptyState
            title="Không có yêu cầu ở trạng thái này"
            description="Hãy chọn trạng thái khác hoặc quay lại sau."
          />
        ) : null}

        {loadState === "success" && result && result.data.length > 0 ? (
          <div className={styles.layout}>
            <div className={styles.queue} aria-label="Danh sách yêu cầu xác minh">
              {result.data.map((verification) => (
                <article className={styles.card} data-selected={selected?.id === verification.id} key={verification.id}>
                  <div>
                    <span>#{verification.id}</span>
                    <span>{statusLabels[verification.status]}</span>
                  </div>
                  <h2>{verification.displayName}</h2>
                  <p>{verification.landlord.email}</p>
                  <p>{verification.requestNote ?? "Không có ghi chú bổ sung."}</p>
                  <button type="button" onClick={() => void openDetail(verification.id)}>
                    Xem & duyệt
                  </button>
                </article>
              ))}
              <Pagination
                ariaLabel="Phân trang xác minh"
                page={result.pagination.page}
                hasNextPage={result.pagination.hasNextPage}
                onPrevious={() => setPage((value) => value - 1)}
                onNext={() => setPage((value) => value + 1)}
              />
            </div>
            <aside className={styles.detail} aria-label="Chi tiết xác minh">
              {detailLoading ? (
                <LoadingState message="Đang tải chi tiết…" />
              ) : selected ? (
                <>
                  <span className={styles.status}>{statusLabels[selected.status]}</span>
                  <h2>Yêu cầu #{selected.id}</h2>
                  <dl>
                    <div>
                      <dt>Tên hiển thị</dt>
                      <dd>{selected.displayName}</dd>
                    </div>
                    <div>
                      <dt>Email</dt>
                      <dd>{selected.landlord.email}</dd>
                    </div>
                    <div>
                      <dt>Điện thoại</dt>
                      <dd>{selected.landlord.phone ?? "Không có"}</dd>
                    </div>
                    <div>
                      <dt>Tài khoản</dt>
                      <dd>{selected.landlord.isActive ? "Đang hoạt động" : "Đã vô hiệu hóa"}</dd>
                    </div>
                    <div>
                      <dt>Ghi chú gửi lên</dt>
                      <dd>{selected.requestNote ?? "Không có"}</dd>
                    </div>
                    {selected.decisionNote ? (
                      <div>
                        <dt>Quyết định</dt>
                        <dd>{selected.decisionNote}</dd>
                      </div>
                    ) : null}
                  </dl>
                  {selected.status === "PENDING" ? (
                    <div className={styles.actions}>
                      <label htmlFor="verification-decision-note">Ghi chú quyết định</label>
                      <textarea
                        id="verification-decision-note"
                        rows={4}
                        maxLength={1000}
                        value={note}
                        onChange={(event) => setNote(event.target.value)}
                      />
                      <div>
                        <Button pending={actionPending} onClick={() => void decide("APPROVED")}>
                          Duyệt hồ sơ
                        </Button>
                        <Button variant="danger" pending={actionPending} onClick={() => void decide("REJECTED")}>
                          Từ chối
                        </Button>
                      </div>
                    </div>
                  ) : null}
                  {message ? (
                    <p className={styles.error} role="alert">
                      {message}
                    </p>
                  ) : null}
                </>
              ) : message ? (
                <p className={styles.error} role="alert">
                  {message}
                </p>
              ) : (
                <EmptyState title="Chọn một yêu cầu để duyệt" description="Thông tin hồ sơ sẽ xuất hiện tại đây." />
              )}
            </aside>
          </div>
        ) : null}
      </div>
    </section>
  );
}
