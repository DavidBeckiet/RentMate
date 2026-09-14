import type { Notification } from "../repositories/contact-repository.js";

export interface NotificationRealtimeEvent {
  readonly recipientId: number;
  readonly notification: Notification;
}

export type NotificationRealtimeSubscriber = (event: NotificationRealtimeEvent) => void;

export interface NotificationRealtimeHub {
  readonly subscribe: (recipientId: number, subscriber: NotificationRealtimeSubscriber) => () => void;
  readonly publish: (event: NotificationRealtimeEvent) => void;
  readonly subscriberCount: (recipientId: number) => number;
}

export function createNotificationRealtimeHub(): NotificationRealtimeHub {
  const subscribers = new Map<number, Set<NotificationRealtimeSubscriber>>();

  const hub: NotificationRealtimeHub = {
    subscribe(recipientId, subscriber) {
      const recipientSubscribers = subscribers.get(recipientId) ?? new Set<NotificationRealtimeSubscriber>();
      recipientSubscribers.add(subscriber);
      subscribers.set(recipientId, recipientSubscribers);
      let active = true;
      return () => {
        if (!active) return;
        active = false;
        recipientSubscribers.delete(subscriber);
        if (recipientSubscribers.size === 0) subscribers.delete(recipientId);
      };
    },
    publish(event) {
      for (const subscriber of [...(subscribers.get(event.recipientId) ?? [])]) {
        try {
          subscriber(event);
        } catch {
          // A disconnected client must not make the notification listener fail.
        }
      }
    },
    subscriberCount(recipientId) {
      return subscribers.get(recipientId)?.size ?? 0;
    }
  };

  return Object.freeze(hub);
}
