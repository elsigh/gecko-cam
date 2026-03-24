import { cacheLife, cacheTag } from "next/cache";
import { getEvent, listEvents } from "@/lib/kv";

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
