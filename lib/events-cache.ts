import { cacheLife, cacheTag } from "next/cache";
import { getEvent, listAllEvents, listEvents } from "@/lib/kv";

export const EVENTS_LIST_TAG = "events-list";

export function getEventTag(id: string): string {
  return `event-${id}`;
}

export async function getCachedRecentEvents(limit: number) {
  "use cache";

  cacheLife("seconds");
  cacheTag(EVENTS_LIST_TAG);

  const { events } = await listEvents();
  return events.slice(0, limit);
}

export async function getCachedEventsPage(cursor?: string) {
  "use cache";

  cacheLife("seconds");
  cacheTag(EVENTS_LIST_TAG);

  return listEvents(cursor);
}

export async function getCachedEvent(id: string) {
  "use cache";

  cacheLife("seconds");
  cacheTag(EVENTS_LIST_TAG, getEventTag(id));

  return getEvent(id);
}

export async function getCachedEventNavigation(id: string) {
  "use cache";

  cacheLife("seconds");
  cacheTag(EVENTS_LIST_TAG, getEventTag(id));

  const events = await listAllEvents();
  const index = events.findIndex((event) => event.id === id);
  if (index === -1) return null;

  return {
    older: events[index + 1]
      ? { id: events[index + 1].id, timestamp: events[index + 1].timestamp }
      : null,
    newer: events[index - 1]
      ? { id: events[index - 1].id, timestamp: events[index - 1].timestamp }
      : null,
  };
}
