"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type FormEvent,
  type ReactNode,
  type SetStateAction
} from "react";
import { cx } from "../../components/ui/class-names";
import { Icon } from "../../components/ui/icon";
import { IconButton } from "../../components/ui/icon-button";
import { api, ApiError } from "../../lib/api/client";
import { connectInquiryRealtime, type InquiryRealtimeConnectionStatus } from "../../lib/api/inquiry-realtime";
import { useAuth } from "../../lib/auth/auth-provider";
import type { Inquiry, UserRole } from "../../types/api";
import { getInquirySenderLabel, getInquiryStatusLabel } from "./inquiry-presentation";

export type InquiryConversationLoadState = "idle" | "loading" | "success" | "error";

export function mergeMessages(
  ...collections: readonly (readonly Inquiry["messages"][number][])[]
): Inquiry["messages"] {
  const messages = new Map<number, Inquiry["messages"][number]>();
  for (const collection of collections) {
    for (const message of collection) messages.set(message.id, message);
  }
  return Object.freeze([...messages.values()].sort((left, right) => left.id - right.id));
}

export function statusLabel(status: Inquiry["status"], viewerRole: UserRole = "TENANT"): string {
  return getInquiryStatusLabel(status, viewerRole === "LANDLORD" ? "LANDLORD" : "TENANT");
}

export const realtimeStatusLabels: Readonly<Record<InquiryRealtimeConnectionStatus, string>> = Object.freeze({
  connecting: "Đang kết nối trực tiếp…",
  connected: "Đã kết nối trực tiếp — tin mới sẽ tự xuất hiện",
  reconnecting: "Mất kết nối — đang thử kết nối lại…",
  unsupported: "Trình duyệt không hỗ trợ kết nối trực tiếp; bạn vẫn có thể gửi tin"
});

export interface InquiryConversationController {
  readonly inquiry: Inquiry | null;
  readonly state: InquiryConversationLoadState;
  readonly error: ApiError | null;
  readonly realtimeStatus: InquiryRealtimeConnectionStatus;
  readonly draft: string;
  readonly setDraft: Dispatch<SetStateAction<string>>;
  readonly pending: boolean;
  readonly send: (event: FormEvent<HTMLFormElement>) => Promise<boolean>;
  readonly reload: () => void;
  readonly updateInquiry: Dispatch<SetStateAction<Inquiry | null>>;
}

export function useInquiryConversation(inquiryId: number | null, enabled: boolean): InquiryConversationController {
  const { status: authStatus, user } = useAuth();
  const [inquiry, setInquiry] = useState<Inquiry | null>(null);
  const [state, setState] = useState<InquiryConversationLoadState>("idle");
  const [error, setError] = useState<ApiError | null>(null);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [realtimeStatus, setRealtimeStatus] = useState<InquiryRealtimeConnectionStatus>("connecting");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const shouldLoad = enabled && inquiryId !== null;
    setInquiry(null);
    setDraft("");
    setError(null);
    setRealtimeStatus("connecting");

    if (!shouldLoad) {
      setState("idle");
      return;
    }

    setState("loading");
    if (authStatus !== "authenticated" || !user) return;

    const controller = new AbortController();
    let active = true;
    void api.contact
      .getInquiry(inquiryId, controller.signal)
      .then((result) => {
        if (active && !controller.signal.aborted) {
          setInquiry(result);
          setState("success");
        }
      })
      .catch((caught: unknown) => {
        if (active && !controller.signal.aborted) {
          setError(caught instanceof ApiError ? caught : null);
          setState("error");
        }
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [authStatus, enabled, inquiryId, reloadKey, user]);

  const synchronize = useCallback(async () => {
    if (inquiryId === null) return;
    try {
      const fresh = await api.contact.getInquiry(inquiryId);
      setInquiry((current) =>
        current === null ? fresh : { ...fresh, messages: mergeMessages(current.messages, fresh.messages) }
      );
    } catch {
      // The realtime connection can reconnect; the current conversation remains usable.
    }
  }, [inquiryId]);

  useEffect(() => {
    if (!enabled || inquiryId === null || authStatus !== "authenticated" || !user || state !== "success") return;

    const connection = connectInquiryRealtime(inquiryId, {
      onStatusChange: setRealtimeStatus,
      onEvent: (event) => {
        if (event.inquiryId !== inquiryId) return;
        if (event.type === "CONNECTED") return;
        if (event.type === "MESSAGE_CREATED") {
          setInquiry((current) =>
            current === null ? current : { ...current, messages: mergeMessages(current.messages, [event.message]) }
          );
          if (event.message.senderRole !== user.role) void synchronize();
        } else if (event.type === "STATUS_CHANGED") {
          setInquiry((current) =>
            current === null ? current : { ...current, status: event.status, updatedAt: event.updatedAt }
          );
        } else {
          void synchronize();
        }
      }
    });

    return () => connection.close();
  }, [authStatus, enabled, inquiryId, state, synchronize, user]);

  const send = useCallback(
    async (event: FormEvent<HTMLFormElement>): Promise<boolean> => {
      event.preventDefault();
      if (pending || !inquiry || inquiry.status === "CLOSED" || !inquiry.canSendMessage || !draft.trim()) return false;

      setPending(true);
      setError(null);
      try {
        const sent = await api.contact.sendMessage(inquiry.id, draft.trim());
        setInquiry((current) =>
          current === null ? current : { ...current, messages: mergeMessages(current.messages, [sent]) }
        );
        setDraft("");
        return true;
      } catch (caught: unknown) {
        setError(caught instanceof ApiError ? caught : null);
        return false;
      } finally {
        setPending(false);
      }
    },
    [draft, inquiry, pending]
  );

  const reload = useCallback(() => setReloadKey((current) => current + 1), []);

  return {
    inquiry,
    state,
    error,
    realtimeStatus,
    draft,
    setDraft,
    pending,
    send,
    reload,
    updateInquiry: setInquiry
  };
}

export interface InquiryConversationCoreProps {
  readonly conversation: InquiryConversationController;
  readonly currentUserRole: UserRole;
  readonly variant?: "page" | "floating";
  readonly textareaId?: string;
  readonly showRealtimeStatus?: boolean;
  readonly className?: string;
  readonly emptyMessage?: ReactNode;
}

export function InquiryConversationCore({
  conversation,
  currentUserRole,
  variant = "page",
  textareaId = "reply",
  showRealtimeStatus = false,
  className,
  emptyMessage
}: InquiryConversationCoreProps) {
  const { inquiry, error, draft, setDraft, pending, send, realtimeStatus } = conversation;
  const isFloating = variant === "floating";
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messageListRef = useRef<HTMLDivElement>(null);
  const previousConversationIdRef = useRef<number | null>(null);
  const previousLatestMessageIdRef = useRef<number | null>(null);
  const initializedConversationRef = useRef(false);
  const nearBottomRef = useRef(true);
  const [showNewMessageIndicator, setShowNewMessageIndicator] = useState(false);

  const resizeComposerTextarea = useCallback(() => {
    if (!textareaRef.current) return;

    const textarea = textareaRef.current;
    const computedStyle = window.getComputedStyle(textarea);
    const minHeight = Number.parseFloat(computedStyle.minHeight) || 48;
    const maxHeight = Number.parseFloat(computedStyle.maxHeight) || 96;
    textarea.style.height = "auto";
    const nextHeight = Math.min(Math.max(textarea.scrollHeight, minHeight), maxHeight);
    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? "auto" : "hidden";
  }, []);

  useEffect(() => {
    resizeComposerTextarea();
  }, [draft, resizeComposerTextarea]);

  const scrollToLatest = useCallback((behavior: ScrollBehavior = "smooth") => {
    const messageList = messageListRef.current;
    if (!messageList) return;

    const reducedMotion =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const resolvedBehavior = reducedMotion ? "auto" : behavior;

    if (typeof messageList.scrollTo === "function") {
      try {
        messageList.scrollTo({ top: messageList.scrollHeight, behavior: resolvedBehavior });
      } catch {
        messageList.scrollTop = messageList.scrollHeight;
      }
    } else {
      messageList.scrollTop = messageList.scrollHeight;
    }
    nearBottomRef.current = true;
    setShowNewMessageIndicator(false);
  }, []);

  const handleMessageListScroll = useCallback(() => {
    const messageList = messageListRef.current;
    if (!messageList) return;

    const distanceFromBottom = Math.max(0, messageList.scrollHeight - messageList.scrollTop - messageList.clientHeight);
    const nearBottom = distanceFromBottom <= 100;
    nearBottomRef.current = nearBottom;
    if (nearBottom) setShowNewMessageIndicator(false);
  }, []);

  useEffect(() => {
    const conversationId = inquiry?.id ?? null;
    if (conversationId === previousConversationIdRef.current) return;

    previousConversationIdRef.current = conversationId;
    previousLatestMessageIdRef.current = null;
    initializedConversationRef.current = false;
    nearBottomRef.current = true;
    setShowNewMessageIndicator(false);
  }, [inquiry?.id]);

  useEffect(() => {
    if (!inquiry || !messageListRef.current) return;

    const latestMessage = inquiry.messages[inquiry.messages.length - 1] ?? null;
    const latestMessageId = latestMessage?.id ?? null;

    if (!initializedConversationRef.current) {
      initializedConversationRef.current = true;
      previousLatestMessageIdRef.current = latestMessageId;
      scrollToLatest("auto");
      return;
    }

    if (latestMessageId === previousLatestMessageIdRef.current) return;
    previousLatestMessageIdRef.current = latestMessageId;

    if (latestMessage && (latestMessage.senderRole === currentUserRole || nearBottomRef.current)) {
      scrollToLatest("smooth");
    } else {
      setShowNewMessageIndicator(true);
    }
  }, [currentUserRole, inquiry, scrollToLatest]);

  if (!inquiry) return emptyMessage ? <>{emptyMessage}</> : null;

  const viewerRole = currentUserRole === "LANDLORD" ? "LANDLORD" : "TENANT";
  const showDegradedRealtimeStatus =
    showRealtimeStatus && (realtimeStatus === "reconnecting" || realtimeStatus === "unsupported");
  return (
    <div className={cx(isFloating ? "flex h-full min-h-0 flex-col gap-3" : "space-y-4", className)}>
      {showDegradedRealtimeStatus ? (
        <p
          role="status"
          aria-live="polite"
          className="rounded-control border border-border bg-surface-subtle px-3 py-2 text-xs font-semibold text-muted-foreground"
        >
          {realtimeStatusLabels[realtimeStatus]}
        </p>
      ) : null}
      {error ? (
        <p
          role="alert"
          className="rounded-control border border-danger/30 bg-danger-subtle p-3 text-sm font-semibold text-danger"
        >
          Không thể gửi tin nhắn. Vui lòng thử lại.
        </p>
      ) : null}
      <div className={cx("relative min-w-0", isFloating && "min-h-0 flex-1")}>
        <div
          ref={messageListRef}
          onScroll={handleMessageListScroll}
          className={cx(
            "space-y-4",
            isFloating ? "h-full overflow-y-auto pr-1" : "max-h-[min(36rem,60vh)] overflow-y-auto pr-1"
          )}
          aria-label="Tin nhắn trong cuộc trò chuyện"
          aria-live="polite"
          aria-relevant="additions text"
        >
          {inquiry.messages.length > 0 ? (
            inquiry.messages.map((item) => (
              <article
                key={item.id}
                className={`rm-inquiry-message w-fit max-w-[88%] rounded-card border border-border p-4 shadow-surface sm:max-w-[78%] ${item.senderRole === currentUserRole ? "ml-auto bg-primary-subtle" : "bg-surface"}`}
              >
                <p className="text-[0.68rem] font-bold tracking-wide text-slate-500">
                  {getInquirySenderLabel(item.senderRole, viewerRole)} ·{" "}
                  {new Date(item.createdAt).toLocaleString("vi-VN")}
                </p>
                <p className="mt-2 whitespace-pre-wrap text-sm font-medium leading-6">{item.body}</p>
              </article>
            ))
          ) : (
            <p className="rounded-control border border-dashed border-border-strong bg-surface-subtle p-4 text-sm text-muted-foreground">
              Chưa có tin nhắn trong cuộc trò chuyện.
            </p>
          )}
        </div>
        {showNewMessageIndicator ? (
          <button
            type="button"
            onClick={() => scrollToLatest("smooth")}
            className="absolute bottom-3 left-1/2 z-10 min-h-11 -translate-x-1/2 whitespace-nowrap rounded-full border border-primary/20 bg-surface px-3 py-2 text-xs font-bold text-primary-hover shadow-raised outline-none transition-colors hover:bg-primary-subtle focus-visible:ring-[3px] focus-visible:ring-focus/30 motion-reduce:transition-none"
          >
            Tin nhắn mới ↓
          </button>
        ) : null}
      </div>
      {inquiry.status === "CLOSED" ? (
        <p className="rounded-control border-l-4 border-muted-foreground bg-surface-subtle p-4 text-sm font-semibold text-muted-foreground">
          Cuộc trò chuyện đã đóng, không thể gửi thêm tin nhắn.
        </p>
      ) : !inquiry.canSendMessage ? (
        <p className="rounded-control border-l-4 border-muted-foreground bg-surface-subtle p-4 text-sm font-semibold text-muted-foreground">
          Cuộc trò chuyện đang bị giới hạn, không thể gửi tin nhắn mới.
        </p>
      ) : (
        <form
          onSubmit={(event) => void send(event)}
          className={cx(
            isFloating
              ? "shrink-0 border-t border-border bg-surface pt-3"
              : "rounded-card border border-border bg-surface p-4 shadow-surface sm:p-5"
          )}
        >
          <label htmlFor={textareaId} className="sr-only">
            Nhập tin nhắn
          </label>
          <div className="mt-3 flex min-w-0 items-end gap-2">
            <textarea
              id={textareaId}
              required
              maxLength={4000}
              rows={1}
              ref={textareaRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              className="min-h-12 min-w-0 max-h-24 flex-1 resize-none overflow-y-auto rounded-control border border-border-strong bg-surface px-3 py-2.5 text-sm font-medium leading-6 outline-none transition focus:border-primary focus:ring-[3px] focus:ring-primary/20"
              placeholder="Nhập tin nhắn…"
            />
            <IconButton
              type="submit"
              label="Gửi tin nhắn"
              variant="primary"
              size="sm"
              pending={pending}
              pendingLabel="Đang gửi…"
              className="rounded-full"
            >
              <Icon name="send" className="h-4 w-4" />
            </IconButton>
          </div>
        </form>
      )}
    </div>
  );
}
