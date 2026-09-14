"use client";

import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../../components/ui/icon";
import { IconButton } from "../../components/ui/icon-button";
import { useAuth } from "../../lib/auth/auth-provider";
import { roommateChatEvent } from "./roommate-chat-link";
import styles from "../contact/message-inbox.module.css";

const Conversation = dynamic(() =>
  import("./roommate-conversation-page").then((module) => module.RoommateConversationPage)
);

export function FloatingRoommateChat() {
  const { user, status } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [chat, setChat] = useState<{ id: number; userId: number; minimized: boolean } | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const hiddenByRoute =
    pathname.startsWith("/inquiries") ||
    pathname.startsWith("/roommates/conversations/") ||
    pathname.startsWith("/roommates/messages");
  useEffect(() => {
    if (status !== "authenticated" || user?.role !== "TENANT" || !user.isActive) {
      setChat(null);
      return;
    }
    const open = (event: Event) => {
      const id = (event as CustomEvent<{ id?: number }>).detail?.id;
      if (!Number.isSafeInteger(id) || !id || id < 1) return;
      event.preventDefault();
      if (hiddenByRoute || !window.matchMedia("(min-width: 1024px)").matches) {
        router.push(`/roommates/messages?roommate=${id}`);
        return;
      }
      triggerRef.current = document.activeElement as HTMLElement | null;
      setChat({ id, userId: user.id, minimized: false });
    };
    window.addEventListener(roommateChatEvent, open);
    return () => window.removeEventListener(roommateChatEvent, open);
  }, [status, user, hiddenByRoute, router]);
  useEffect(() => {
    if (!chat) return;
    const media = window.matchMedia("(max-width: 1023px)");
    const resize = () => {
      if (media.matches && !hiddenByRoute) {
        router.push(`/roommates/messages?roommate=${chat.id}`);
        setChat(null);
      }
    };
    media.addEventListener("change", resize);
    return () => media.removeEventListener("change", resize);
  }, [chat, hiddenByRoute, router]);
  if (!chat || user?.id !== chat.userId || status !== "authenticated" || hiddenByRoute) return null;
  return createPortal(
    <div className={styles.floating}>
      <section
        hidden={chat.minimized}
        aria-label="Chat ở ghép"
        className={styles.floatingPanel}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setChat({ ...chat, minimized: true });
            triggerRef.current?.focus();
          }
        }}
      >
        <header className={styles.floatingHeader}>
          <span>Ở ghép</span>
          <div className="flex gap-1">
            <IconButton
              label="Mở trong Tin nhắn"
              size="sm"
              onClick={() => router.push(`/roommates/messages?roommate=${chat.id}`)}
            >
              <Icon name="arrowUpRight" className="h-4 w-4" />
            </IconButton>
            <IconButton label="Thu gọn chat ở ghép" size="sm" onClick={() => setChat({ ...chat, minimized: true })}>
              <Icon name="minus" className="h-4 w-4" />
            </IconButton>
            <IconButton
              label="Đóng chat ở ghép"
              size="sm"
              onClick={() => {
                setChat(null);
                triggerRef.current?.focus();
              }}
            >
              <Icon name="close" className="h-4 w-4" />
            </IconButton>
          </div>
        </header>
        <div className="min-h-0 flex-1">
          <Conversation key={chat.id} interestId={String(chat.id)} embedded />
        </div>
      </section>
      {chat.minimized ? (
        <IconButton
          label="Mở chat ở ghép"
          variant="primary"
          className="rounded-full shadow-raised"
          onClick={() => setChat({ ...chat, minimized: false })}
        >
          <Icon name="message" className="h-6 w-6" />
        </IconButton>
      ) : null}
    </div>,
    document.body
  );
}
