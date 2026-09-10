export const NOTIFICATION_PAGE_SIZE = 20;

export interface NotificationPageQuery {
  readonly page: number;
  readonly valid: boolean;
}

function readPageValue(params: URLSearchParams): string | undefined {
  const values = params.getAll("page");
  if (values.length > 1) throw new Error("duplicate");
  return values[0];
}

export function parseNotificationPageQuery(params: URLSearchParams): NotificationPageQuery {
  try {
    const value = readPageValue(params);
    if (value === undefined) return { page: 1, valid: true };
    if (!/^[1-9][0-9]*$/u.test(value)) return { page: 1, valid: false };

    const page = Number(value);
    return Number.isSafeInteger(page) && page > 0 ? { page, valid: true } : { page: 1, valid: false };
  } catch {
    return { page: 1, valid: false };
  }
}

export function notificationPageUrl(page: number): string {
  return page <= 1 ? "/notifications" : `/notifications?page=${page}`;
}
