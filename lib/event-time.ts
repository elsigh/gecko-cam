const EVENT_TIME_ZONE = "America/Phoenix";

const eventTimestampFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZoneName: "short",
  timeZone: EVENT_TIME_ZONE,
});

const eventDateFormatter = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "short",
  day: "numeric",
  timeZone: EVENT_TIME_ZONE,
});

const eventTimeFormatter = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZoneName: "short",
  timeZone: EVENT_TIME_ZONE,
});

export function formatEventTimestamp(timestamp: number): string {
  return eventTimestampFormatter.format(new Date(timestamp));
}

export function formatEventDate(timestamp: number): string {
  return eventDateFormatter.format(new Date(timestamp));
}

export function formatEventTime(timestamp: number): string {
  return eventTimeFormatter.format(new Date(timestamp));
}
