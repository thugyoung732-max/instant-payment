/** Deterministic date/time labels, formatted in UTC so server and client markup agree. */

const DATE = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

const DATE_LONG = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

const TIME = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: "UTC",
});

export function formatShortDateTime(date: Date): string {
  return `${DATE.format(date)}, ${TIME.format(date)}`;
}

export function formatLongDateTime(date: Date): string {
  return `${DATE_LONG.format(date)}, ${TIME.format(date)} UTC`;
}

export function formatShortDate(date: Date): string {
  return DATE.format(date);
}
