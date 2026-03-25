const EVENT_TIME_ZONE = "America/Phoenix";

const eventTimestampFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: EVENT_TIME_ZONE,
});

export function formatEventTimestamp(timestamp: number): string {
  return eventTimestampFormatter.format(new Date(timestamp));
}
