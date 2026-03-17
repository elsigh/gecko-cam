import { kv } from "@vercel/kv";
import type { GeckoEvent } from "./types";

const EVENTS_ZSET = "gecko:events";
const EVENT_KEY = (id: string) => `gecko:event:${id}`;
const MAX_EVENTS = 200;
const PAGE_SIZE = 12;

export async function saveEvent(event: GeckoEvent): Promise<void> {
  const pipeline = kv.pipeline();
  pipeline.hset(EVENT_KEY(event.id), event);
  pipeline.zadd(EVENTS_ZSET, { score: event.timestamp, member: event.id });
  // Enforce rolling cap — remove oldest beyond MAX_EVENTS
  pipeline.zremrangebyrank(EVENTS_ZSET, 0, -(MAX_EVENTS + 1));
  await pipeline.exec();
}

export async function listEvents(
  cursor?: string
): Promise<{ events: GeckoEvent[]; nextCursor: string | null }> {
  // cursor encodes the max score (timestamp) to paginate backwards (newest first)
  const maxScore = cursor ? Number(cursor) - 1 : "+inf";

  const ids: string[] = await kv.zrangebyscore(
    EVENTS_ZSET,
    "-inf",
    maxScore,
    { rev: true, limit: { offset: 0, count: PAGE_SIZE + 1 } }
  );

  const hasMore = ids.length > PAGE_SIZE;
  const pageIds = ids.slice(0, PAGE_SIZE);

  if (pageIds.length === 0) {
    return { events: [], nextCursor: null };
  }

  const events = await Promise.all(
    pageIds.map((id) => kv.hgetall<GeckoEvent>(EVENT_KEY(id)))
  );

  const validEvents = events.filter((e): e is GeckoEvent => e !== null);

  let nextCursor: string | null = null;
  if (hasMore && validEvents.length > 0) {
    nextCursor = String(validEvents[validEvents.length - 1].timestamp);
  }

  return { events: validEvents, nextCursor };
}

export async function deleteEvent(id: string): Promise<void> {
  const pipeline = kv.pipeline();
  pipeline.del(EVENT_KEY(id));
  pipeline.zrem(EVENTS_ZSET, id);
  await pipeline.exec();
}

export async function getEvent(id: string): Promise<GeckoEvent | null> {
  return kv.hgetall<GeckoEvent>(EVENT_KEY(id));
}
