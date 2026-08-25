import type { InquiryMessage } from "../repositories/contact-repository.js";
import type { InquiryStatus } from "../validations/contact-validation.js";

export type InquiryRealtimeEvent =
  | Readonly<{
      type: "CONNECTED";
      inquiryId: number;
    }>
  | Readonly<{
      type: "MESSAGE_CREATED";
      inquiryId: number;
      message: InquiryMessage;
    }>
  | Readonly<{
      type: "STATUS_CHANGED";
      inquiryId: number;
      status: InquiryStatus;
      updatedAt: string;
    }>;

export type InquiryRealtimeSubscriber = (event: InquiryRealtimeEvent) => void;

export interface InquiryRealtimeHub {
  readonly subscribe: (inquiryId: number, subscriber: InquiryRealtimeSubscriber) => () => void;
  readonly publish: (event: InquiryRealtimeEvent) => void;
  readonly subscriberCount: (inquiryId: number) => number;
}

export function createInquiryRealtimeHub(): InquiryRealtimeHub {
  const subscribers = new Map<number, Set<InquiryRealtimeSubscriber>>();

  const hub: InquiryRealtimeHub = {
    subscribe(inquiryId, subscriber) {
      const inquirySubscribers = subscribers.get(inquiryId) ?? new Set<InquiryRealtimeSubscriber>();
      inquirySubscribers.add(subscriber);
      subscribers.set(inquiryId, inquirySubscribers);
      let active = true;
      return () => {
        if (!active) return;
        active = false;
        inquirySubscribers.delete(subscriber);
        if (inquirySubscribers.size === 0) subscribers.delete(inquiryId);
      };
    },
    publish(event) {
      for (const subscriber of [...(subscribers.get(event.inquiryId) ?? [])]) {
        try {
          subscriber(event);
        } catch {
          // A disconnected client must not make the committed message request fail.
        }
      }
    },
    subscriberCount(inquiryId) {
      return subscribers.get(inquiryId)?.size ?? 0;
    }
  };
  return Object.freeze(hub);
}
