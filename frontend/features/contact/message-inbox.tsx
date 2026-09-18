"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "../../components/ui/button";
import { Icon } from "../../components/ui/icon";
import { ErrorState, LoadingState } from "../../components/ui/feedback-states";
import { useAuth } from "../../lib/auth/auth-provider";
import { api } from "../../lib/api/client";
import type { ApiPage, Inquiry, RoommateInterest } from "../../types/api";
import { RoommateConversationPage } from "../roommate/roommate-conversation-page";
import { InquiryConversationCore, useInquiryConversation } from "./inquiry-conversation";
import { InquirySafetyMenu } from "./inquiry-safety-menu";
import styles from "./message-inbox.module.css";

type Kind = "ALL" | "RENTAL" | "ROOMMATE";
interface Thread {
  key: string;
  id: number;
  kind: Exclude<Kind, "ALL">;
  title: string;
  subtitle: string;
  preview: string;
  updatedAt: string;
  unread: number;
}
const fold = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();
const date = new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const safePreview = (body: string) =>
  body === "This message is no longer available." ? "Tin nhắn này hiện không còn hiển thị." : body;
export function rentalThread(item: Inquiry, landlord: boolean): Thread {
  const last = item.lastMessage ?? item.messages.at(-1);
  return {
    key: `rental:${item.id}`,
    id: item.id,
    kind: "RENTAL",
    title: item.listingSummary?.title ?? "Tin đăng không còn khả dụng",
    subtitle: landlord ? "Người thuê" : "Chủ trọ",
    preview: last ? safePreview(last.body) : "Chưa có tin nhắn",
    updatedAt: last?.createdAt ?? item.updatedAt,
    unread:
      item.unreadCount ??
      item.messages.filter((m) => !m.isRead && m.senderRole !== (landlord ? "LANDLORD" : "TENANT")).length
  };
}
export function roommateThread(item: RoommateInterest): Thread {
  return {
    key: `roommate:${item.id}`,
    id: item.id,
    kind: "ROOMMATE",
    title: item.counterpart?.displayName || "Người ở ghép",
    subtitle: item.request.listing?.title ?? item.request.preferredAreaKeys.join(" · "),
    preview: safePreview(item.lastMessage?.body ?? item.initialMessage?.body ?? "Chưa có tin nhắn"),
    updatedAt: item.lastMessage?.createdAt ?? item.updatedAt,
    unread: item.unreadCount ?? 0
  };
}
async function loadPages<T>(
  fetchPage: (page: number) => Promise<ApiPage<T>>,
  signal: AbortSignal,
  append: (items: readonly T[]) => void
) {
  for (let page = 1; !signal.aborted; page++) {
    const result = await fetchPage(page);
    if (signal.aborted) return;
    append(result.data);
    if (!result.pagination.hasNextPage) return;
    if (!result.data.length) throw new Error("Empty intermediate inbox page");
  }
}
function RentalConversation({ id, landlord, onRead }: { id: number; landlord: boolean; onRead: () => void }) {
  const conversation = useInquiryConversation(id, true);
  useEffect(() => {
    if (conversation.state === "success") onRead();
  }, [conversation.state, onRead]);
  if (conversation.state === "error")
    return (
      <ErrorState
        message="Không thể mở cuộc trò chuyện."
        action={<Button onClick={conversation.reload}>Thử lại</Button>}
      />
    );
  if (!conversation.inquiry) return <LoadingState message="Đang mở cuộc trò chuyện…" />;
  const inquiry = conversation.inquiry;
  return (
    <div className={styles.rentalChat}>
      <header className={styles.rentalHeader}>
        <div className="min-w-0">
          <h2>{inquiry.listingSummary?.title ?? "Trò chuyện thuê phòng"}</h2>
          <Link href={`/inquiries/${id}`}>Thông tin cuộc trò chuyện</Link>
        </div>
        <InquirySafetyMenu
          inquiry={inquiry}
          onInquiryChange={(next) =>
            conversation.updateInquiry((current) => (current ? { ...current, ...next } : current))
          }
        />
      </header>
      <div className="min-h-0 flex-1 p-3">
        <InquiryConversationCore
          conversation={conversation}
          currentUserRole={landlord ? "LANDLORD" : "TENANT"}
          variant="floating"
        />
      </div>
    </div>
  );
}

export function MessageInbox({
  landlord = false,
  roommateOnly = false
}: {
  landlord?: boolean;
  roommateOnly?: boolean;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const { status, user, refresh } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<string[]>([]);
  const [reload, setReload] = useState(0);
  const [query, setQuery] = useState(params.get("q") ?? "");
  const [kind, setKind] = useState<Kind>(
    roommateOnly
      ? "ROOMMATE"
      : params.get("kind") === "ROOMMATE" && !landlord
        ? "ROOMMATE"
        : params.get("kind") === "RENTAL"
          ? "RENTAL"
          : "ALL"
  );
  const [unreadOnly, setUnreadOnly] = useState(params.get("unread") === "1");
  const [page, setPage] = useState(1);
  const [loadedFor, setLoadedFor] = useState<number | null>(null);
  const readDuringLoad = useRef(new Set<string>());
  const frameRef = useRef<HTMLDivElement>(null);
  const selectionValue = params.get("roommate") ?? params.get("inquiry");
  const selectedId =
    selectionValue && /^[1-9]\d*$/.test(selectionValue) && Number.isSafeInteger(Number(selectionValue))
      ? Number(selectionValue)
      : null;
  const selectedKind = params.has("roommate") ? "ROOMMATE" : "RENTAL";
  const selected =
    selectedId && (!landlord || selectedKind === "RENTAL") && (!roommateOnly || selectedKind === "ROOMMATE")
      ? `${selectedKind.toLowerCase()}:${selectedId}`
      : null;
  const allowed =
    mounted && status === "authenticated" && user?.isActive && user.role === (landlord ? "LANDLORD" : "TENANT");
  const userId = user?.id;
  const markSelectedRead = useCallback(() => {
    if (selected) readDuringLoad.current.add(selected);
    setThreads((current) => current.map((thread) => (thread.key === selected ? { ...thread, unread: 0 } : thread)));
  }, [selected]);
  useEffect(() => {
    if (!allowed || !userId) return;
    const controller = new AbortController();
    const collected = new Map<string, Thread>();
    readDuringLoad.current.clear();
    setThreads([]);
    setLoadedFor(userId);
    setPage(1);
    setLoading(true);
    setErrors([]);
    const append = (rows: Thread[]) => {
      rows.forEach((row) => collected.set(row.key, row));
      setThreads(
        [...collected.values()].map((row) => (readDuringLoad.current.has(row.key) ? { ...row, unread: 0 } : row))
      );
    };
    const sources: { label: string; run: () => Promise<void> }[] = roommateOnly
      ? []
      : [
          {
            label: "Thuê phòng",
            run: () =>
              loadPages(
                (page) =>
                  landlord
                    ? api.contact.listLandlordInquiries({ page, pageSize: 100 }, controller.signal)
                    : api.contact.listTenantInquiries({ page, pageSize: 100 }, controller.signal),
                controller.signal,
                (items) => append(items.map((item) => rentalThread(item, landlord)))
              )
          }
        ];
    if (!landlord)
      for (const direction of ["INCOMING", "OUTGOING"] as const)
        sources.push({
          label: `Ở ghép (${direction === "INCOMING" ? "nhận" : "gửi"})`,
          run: () =>
            loadPages(
              (page) => api.roommates.listInterests({ direction, page, pageSize: 50 }, controller.signal),
              controller.signal,
              (items) => append(items.map(roommateThread))
            )
        });
    void Promise.allSettled(sources.map((source) => source.run())).then((results) => {
      if (controller.signal.aborted) return;
      setErrors(results.flatMap((result, index) => (result.status === "rejected" ? [sources[index].label] : [])));
      setLoading(false);
    });
    return () => controller.abort();
  }, [allowed, userId, landlord, roommateOnly, reload]);
  useEffect(() => {
    const refreshInbox = () => {
      if (document.visibilityState === "visible") setReload((v) => v + 1);
    };
    window.addEventListener("focus", refreshInbox);
    return () => window.removeEventListener("focus", refreshInbox);
  }, []);
  useEffect(() => {
    const resize = () => {
      const frame = frameRef.current;
      if (!frame) return;
      const nav = document.querySelector(".rm-mobile-nav")?.getBoundingClientRect().height ?? 0;
      // Layout offsets exclude the route entrance transform, which otherwise
      // makes the composer overlap the mobile navigation after the animation.
      let layoutTop = 0;
      for (let element: HTMLElement | null = frame; element; element = element.offsetParent as HTMLElement | null) {
        layoutTop += element.offsetTop;
      }
      frame.style.height = `${Math.max(260, (window.visualViewport?.height ?? innerHeight) - (layoutTop - window.scrollY) - nav - 16)}px`;
    };
    resize();
    // The shell may mount its mobile navigation after authentication resolves.
    const observer = new MutationObserver(resize);
    observer.observe(document.body, { childList: true, subtree: true });
    const layoutObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(resize);
    layoutObserver?.observe(document.body);
    window.addEventListener("resize", resize);
    window.visualViewport?.addEventListener("resize", resize);
    return () => {
      observer.disconnect();
      layoutObserver?.disconnect();
      window.removeEventListener("resize", resize);
      window.visualViewport?.removeEventListener("resize", resize);
    };
  }, [allowed, selected]);
  const visible = useMemo(
    () =>
      threads
        .filter(
          (thread) =>
            (kind === "ALL" || thread.kind === kind) &&
            (!unreadOnly || thread.unread > 0) &&
            fold(`${thread.title} ${thread.subtitle}`).includes(fold(query.trim()))
        )
        .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt) || a.key.localeCompare(b.key)),
    [threads, kind, query, unreadOnly]
  );
  const inboxEmpty = !selected && loadedFor === user?.id && !loading && !errors.length && threads.length === 0;
  const unreadTotal = threads.reduce((total, thread) => total + thread.unread, 0);
  const resetFilters = () => {
    setQuery("");
    setKind(roommateOnly ? "ROOMMATE" : "ALL");
    setUnreadOnly(false);
    setPage(1);
  };
  const open = (thread: Thread | null) => {
    const next = new URLSearchParams();
    if (query) next.set("q", query);
    if (kind !== "ALL") next.set("kind", kind);
    if (unreadOnly) next.set("unread", "1");
    if (thread) next.set(thread.kind === "ROOMMATE" ? "roommate" : "inquiry", String(thread.id));
    router.push(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
    if (!thread) setReload((v) => v + 1);
  };
  if (!mounted || status === "loading") return <LoadingState message="Đang kiểm tra tài khoản…" />;
  if (status === "error")
    return (
      <ErrorState
        message="Không thể kiểm tra tài khoản."
        action={<Button onClick={() => void refresh()}>Thử lại</Button>}
      />
    );
  if (!allowed)
    return (
      <section>
        <h1>Đăng nhập để xem tin nhắn</h1>
        <Link href="/login">Đăng nhập</Link>
      </section>
    );
  return (
    <section
      className={styles.inbox}
      data-workspace={landlord ? "landlord" : undefined}
      aria-label={roommateOnly ? "Tin nhắn ở ghép" : "Tin nhắn"}
    >
      <header className={styles.title}>
        <div className={styles.titleLead}>
          <span className={styles.titleIcon} aria-hidden="true">
            <Icon name="message" className="h-5 w-5" />
          </span>
          <div>
            <span className={styles.eyebrow}>Trung tâm trao đổi</span>
            <h1>{roommateOnly ? "Tin nhắn ở ghép" : "Tin nhắn"}</h1>
            <p>
              {roommateOnly
                ? "Tiếp tục trò chuyện với những người bạn đã kết nối."
                : landlord
                  ? "Theo dõi yêu cầu và trao đổi với người thuê tại một nơi."
                  : "Thuê phòng và tìm bạn ở ghép, trong cùng một hộp thư."}
            </p>
          </div>
        </div>
        <div className={styles.titleActions}>
          <span className={styles.inboxStatus}>
            <span aria-hidden="true" />
            {loading
              ? "Đang đồng bộ"
              : unreadTotal > 0
                ? `${unreadTotal} tin chưa đọc`
                : threads.length > 0
                  ? `${threads.length} cuộc trò chuyện`
                  : "Sẵn sàng nhận tin"}
          </span>
          <Button variant="secondary" size="sm" onClick={() => setReload((v) => v + 1)} disabled={loading}>
            <Icon name="refresh" className="h-4 w-4" />
            Làm mới
          </Button>
        </div>
      </header>
      <div
        ref={frameRef}
        className={styles.frame}
        data-selected={Boolean(selected)}
        data-empty={inboxEmpty || undefined}
      >
        {inboxEmpty ? (
          <div className={styles.emptyInbox}>
            <div className={styles.emptyInboxCopy}>
              <span className={styles.emptyBadge}>
                <Icon name={landlord ? "home" : "sparkles"} className="h-4 w-4" />
                {landlord ? "Hộp thư chủ trọ" : "Bắt đầu kết nối"}
              </span>
              <h2>{landlord ? "Hộp thư đang chờ cuộc trò chuyện đầu tiên" : "Bạn chưa có cuộc trò chuyện nào"}</h2>
              <p>
                {landlord
                  ? "Khi người thuê gửi yêu cầu từ tin đang hiển thị, cuộc trò chuyện sẽ tự động xuất hiện tại đây."
                  : roommateOnly
                    ? "Khi bạn kết nối với một người ở ghép, cuộc trò chuyện sẽ xuất hiện tại đây."
                    : "Hãy chọn một phòng phù hợp và gửi yêu cầu để bắt đầu trao đổi trực tiếp."}
              </p>
              <div className={styles.emptyActions}>
                <Link
                  href={landlord ? "/landlord" : roommateOnly ? "/roommates" : "/search"}
                  className={styles.emptyPrimary}
                >
                  <Icon name={landlord ? "home" : "search"} className="h-4 w-4" />
                  {landlord ? "Xem tin đang quản lý" : roommateOnly ? "Tìm người ở ghép" : "Khám phá phòng"}
                </Link>
                <button type="button" className={styles.emptyRefresh} onClick={() => setReload((v) => v + 1)}>
                  <Icon name="refresh" className="h-4 w-4" />
                  Kiểm tra tin mới
                </button>
              </div>
              <div className={styles.emptyBenefits}>
                <div>
                  <span className={styles.benefitIcon} data-tone="green">
                    <Icon name="bell" className="h-4 w-4" />
                  </span>
                  <span>
                    <strong>{roommateOnly ? "Không bỏ lỡ lời chào" : "Không bỏ lỡ yêu cầu"}</strong>
                    <small>Tin chưa đọc luôn được đánh dấu rõ ràng.</small>
                  </span>
                </div>
                <div>
                  <span className={styles.benefitIcon} data-tone="blue">
                    <Icon name="message" className="h-4 w-4" />
                  </span>
                  <span>
                    <strong>Trao đổi tập trung</strong>
                    <small>
                      {roommateOnly
                        ? "Mỗi cuộc trò chuyện gắn với đúng người bạn quan tâm."
                        : "Mỗi cuộc trò chuyện gắn đúng với tin phòng."}
                    </small>
                  </span>
                </div>
                <div>
                  <span className={styles.benefitIcon} data-tone="amber">
                    <Icon name="shield" className="h-4 w-4" />
                  </span>
                  <span>
                    <strong>An toàn và riêng tư</strong>
                    <small>Thông tin trao đổi được giữ trong RentMate.</small>
                  </span>
                </div>
              </div>
            </div>
            <div className={styles.emptyVisual} aria-hidden="true">
              <span className={styles.visualOrb} />
              <div className={styles.previewWindow}>
                <div className={styles.previewHeader}>
                  <span className={styles.previewAvatar}>
                    <Icon name={roommateOnly ? "users" : "home"} className="h-4 w-4" />
                  </span>
                  <span>
                    <strong>{roommateOnly ? "Minh Anh" : "Phòng studio của bạn"}</strong>
                    <small>
                      <i /> {roommateOnly ? "Đang tìm ở ghép" : "Đang hiển thị"}
                    </small>
                  </span>
                  <Icon name="message" className="h-5 w-5" />
                </div>
                <div className={styles.previewBody}>
                  <div className={styles.previewDay}>Hôm nay</div>
                  <div className={styles.previewIncoming}>
                    <span>T</span>
                    <p>
                      {roommateOnly
                        ? "Chào bạn, mình cũng đang tìm phòng ở Quận 3."
                        : "Chào anh/chị, phòng này còn trống không ạ?"}
                    </p>
                  </div>
                  <div className={styles.previewOutgoing}>
                    {roommateOnly ? "Chào bạn, ngân sách của tụi mình khá hợp đó!" : "Chào bạn, phòng vẫn còn nhé!"}
                  </div>
                  <div className={styles.previewTyping}>
                    <i />
                    <i />
                    <i />
                  </div>
                </div>
                <div className={styles.previewComposer}>
                  <span>Nhập tin nhắn...</span>
                  <b>
                    <Icon name="send" className="h-4 w-4" />
                  </b>
                </div>
              </div>
              <div className={styles.newMessageCard}>
                <span>
                  <Icon name="bell" className="h-4 w-4" />
                </span>
                <p>
                  <strong>{roommateOnly ? "Lời chào mới" : "Yêu cầu mới"}</strong>
                  <small>Bạn sẽ thấy ngay tại đây</small>
                </p>
                <b>1</b>
              </div>
            </div>
          </div>
        ) : (
          <>
            <aside className={styles.threadPane} aria-label="Danh sách cuộc trò chuyện">
              <div className={styles.filters}>
                <label className={styles.search}>
                  <Icon name="search" className="h-4 w-4" />
                  <input
                    aria-label="Tìm cuộc trò chuyện"
                    placeholder={roommateOnly ? "Tìm tên người ở ghép…" : "Tìm tên hoặc tiêu đề phòng…"}
                    value={query}
                    onChange={(event) => {
                      setQuery(event.target.value);
                      setPage(1);
                    }}
                  />
                </label>
                {!roommateOnly ? (
                  <div className={styles.tabs} role="group" aria-label="Loại trò chuyện">
                    {(["ALL", "RENTAL", ...(!landlord ? ["ROOMMATE"] : [])] as Kind[]).map((value) => (
                      <button
                        type="button"
                        key={value}
                        aria-pressed={kind === value}
                        onClick={() => {
                          setKind(value);
                          setPage(1);
                        }}
                      >
                        {value === "ALL" ? "Tất cả" : value === "RENTAL" ? "Thuê phòng" : "Ở ghép"}
                      </button>
                    ))}
                  </div>
                ) : null}
                <label className={styles.unreadFilter}>
                  <input
                    type="checkbox"
                    checked={unreadOnly}
                    onChange={(event) => {
                      setUnreadOnly(event.target.checked);
                      setPage(1);
                    }}
                  />{" "}
                  Chưa đọc
                </label>
              </div>
              <div className={styles.threadList}>
                {loading ? (
                  <p role="status" className={styles.notice}>
                    Đang tải các cuộc trò chuyện…
                  </p>
                ) : null}
                {errors.length ? (
                  <div className={styles.notice} role="alert">
                    Chưa tải được: {errors.join(", ")}.
                    <button type="button" onClick={() => setReload((v) => v + 1)}>
                      Thử lại
                    </button>
                  </div>
                ) : null}
                {loadedFor === user?.id
                  ? visible.slice((page - 1) * 20, page * 20).map((thread) => (
                      <button
                        key={thread.key}
                        type="button"
                        className={styles.thread}
                        aria-pressed={selected === thread.key}
                        onClick={() => open(thread)}
                      >
                        <span className={styles.avatar} aria-hidden="true">
                          {thread.kind === "ROOMMATE" ? (
                            thread.title
                              .trim()
                              .split(/\s+/)
                              .slice(-2)
                              .map((word) => word[0])
                              .join("")
                          ) : (
                            <Icon name="home" className="h-5 w-5" />
                          )}
                        </span>
                        <span className={styles.threadCopy}>
                          <span className={styles.threadTitle}>{thread.title}</span>
                          <span className={styles.threadSubtitle}>
                            {thread.kind === "ROOMMATE" ? "Ở ghép" : "Thuê phòng"} · {thread.subtitle}
                          </span>
                          <span className={styles.preview}>{thread.preview}</span>
                          <time>{date.format(new Date(thread.updatedAt))}</time>
                        </span>
                        {thread.unread > 0 ? (
                          <span className={styles.unread} aria-label={`${thread.unread} tin chưa đọc`}>
                            {thread.unread > 99 ? "99+" : thread.unread}
                          </span>
                        ) : null}
                      </button>
                    ))
                  : null}
                {!loading && threads.length > 0 && !visible.length ? (
                  <div className={styles.filteredEmpty}>
                    <span>
                      <Icon name="search" className="h-5 w-5" />
                    </span>
                    <strong>Không tìm thấy cuộc trò chuyện</strong>
                    <p>Không có cuộc trò chuyện phù hợp với bộ lọc.</p>
                    <button type="button" onClick={resetFilters}>
                      Xóa bộ lọc
                    </button>
                  </div>
                ) : null}
              </div>
              {visible.length > 20 ? (
                <nav className={styles.listPages} aria-label="Phân trang tin nhắn">
                  <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                    Trang trước
                  </button>
                  <span>
                    {page}/{Math.ceil(visible.length / 20)}
                  </span>
                  <button disabled={page * 20 >= visible.length} onClick={() => setPage((p) => p + 1)}>
                    Trang sau
                  </button>
                </nav>
              ) : null}
            </aside>
            <section className={styles.conversationPane} aria-label="Cuộc trò chuyện đang mở">
              {selected && selectedId ? (
                <>
                  <button className={styles.back} onClick={() => open(null)}>
                    <Icon name="arrow" className="h-4 w-4 rotate-180" /> Danh sách tin nhắn
                  </button>
                  <div className="min-h-0 flex-1">
                    {selectedKind === "ROOMMATE" ? (
                      <RoommateConversationPage
                        key={`${user.id}:${selectedId}`}
                        interestId={String(selectedId)}
                        embedded
                        onRead={markSelectedRead}
                      />
                    ) : (
                      <RentalConversation
                        key={`${user.id}:${selectedId}`}
                        id={selectedId}
                        landlord={landlord}
                        onRead={markSelectedRead}
                      />
                    )}
                  </div>
                </>
              ) : (
                <div className={styles.empty}>
                  <div className={styles.emptyIcon}>
                    <Icon name="message" className="h-7 w-7" />
                  </div>
                  <span className={styles.emptyKicker}>Không gian trao đổi</span>
                  <h2>Chọn một cuộc trò chuyện</h2>
                  <p>Chọn một người ở danh sách bên trái để xem nội dung và tiếp tục trao đổi.</p>
                  <div className={styles.emptyHint}>
                    <Icon name="shield" className="h-4 w-4" />
                    {roommateOnly
                      ? "Thông tin riêng tư chỉ được chia sẻ khi bạn chủ động"
                      : "Mỗi cuộc trò chuyện được gắn với đúng tin phòng"}
                  </div>
                  <div className={styles.emptyBubbles} aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </div>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </section>
  );
}
