export function formatApiTimestamp(value: Date): string {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new TypeError("API timestamp must be a valid Date.");
  }

  return value.toISOString();
}
