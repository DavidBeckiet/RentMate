import { api } from "../../lib/api/client";
import type { RoommateInterest } from "../../types/api";

export const roommateChatEvent = "rentmate:roommate-chat";

export function openRoommateChat(id: number, navigate: (href: string) => void): void {
  if (window.matchMedia?.("(min-width: 1024px)").matches) {
    const event = new CustomEvent(roommateChatEvent, { detail: { id }, cancelable: true });
    if (!window.dispatchEvent(event)) return;
  }
  navigate(`/roommates/messages?roommate=${id}`);
}

export async function findExistingRoommateChat(
  requestId: number,
  signal?: AbortSignal
): Promise<RoommateInterest | null> {
  for (let page = 1; ; page += 1) {
    const result = await api.roommates.listInterests({ direction: "OUTGOING", page, pageSize: 50 }, signal);
    const active = result.data.find(
      (item) => item.requestId === requestId && (item.status === "PENDING" || item.status === "ACCEPTED")
    );
    if (active) return active;
    if (!result.pagination.hasNextPage) return null;
    if (result.data.length === 0) throw new Error("Empty intermediate interest page");
  }
}
