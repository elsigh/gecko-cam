import { createKV } from "@vercel/kv2";
import type { GeckoEvent } from "./types";

// KV2 uses BLOB_READ_WRITE_TOKEN automatically — no separate KV infrastructure needed.
const kv = createKV({ prefix: "gecko-cam/" });

const MAX_EVENTS = 200;
const PAGE_SIZE = 12;

const eventKey = (id: string) => `events/${id}`;

export async function saveEvent(event: GeckoEvent): Promise<void> {
  await kv.set(eventKey(event.id), event);

  // Enforce rolling cap — fetch all keys, sort by timestamp, delete oldest beyond MAX_EVENTS
  const { keys } = await kv.keys("events/").page(MAX_EVENTS + 50, undefined);
  if (keys.length > MAX_EVENTS) {
    // Fetch timestamps for all events to find oldest
    const results = await kv.getMany(keys);
    const entries: { key: string; timestamp: number }[] = [];
    for (const [key, entry] of results) {
      const val = (await entry.value) as GeckoEvent | undefined;
      if (val) entries.push({ key, timestamp: val.timestamp });
    }
    // Sort newest first, delete beyond cap
    entries.sort((a, b) => b.timestamp - a.timestamp);
    const toDelete = entries.slice(MAX_EVENTS).map((e) => e.key);
    await Promise.all(toDelete.map((k) => kv.delete(k)));
  }
}

export async function listEvents(
  cursor?: string
): Promise<{ events: GeckoEvent[]; nextCursor: string | null }> {
  // Fetch a page of keys; over-fetch to allow in-memory sort + pagination
  // Since max events = 200, we can fetch all and sort for correctness
  const { keys, cursor: nextRawCursor } = await kv
    .keys("events/")
    .page(MAX_EVENTS, cursor);

  if (keys.length === 0) {
    return { events: [], nextCursor: null };
  }

  const results = await kv.getMany(keys);
  const events: GeckoEvent[] = [];
  for (const [, entry] of results) {
    const val = (await entry.value) as GeckoEvent | undefined;
    if (val) events.push(val);
  }

  // Sort newest first
  events.sort((a, b) => b.timestamp - a.timestamp);

  const page = events.slice(0, PAGE_SIZE);
  const hasMore = events.length > PAGE_SIZE || !!nextRawCursor;

  return {
    events: page,
    nextCursor: hasMore ? (nextRawCursor ?? String(page[page.length - 1]?.timestamp)) : null,
  };
}

export async function deleteEvent(id: string): Promise<void> {
  await kv.delete(eventKey(id));
}

export async function getEvent(id: string): Promise<GeckoEvent | null> {
  const result = await kv.get(eventKey(id));
  if (!result.exists || !result.value) return null;
  return (await result.value) as GeckoEvent;
}

// ── Snooze ────────────────────────────────────────────────────────────────────

const SNOOZE_KEY = "system/snooze_until";

export async function setSnooze(untilMs: number): Promise<void> {
  await kv.set(SNOOZE_KEY, untilMs);
}

export async function clearSnooze(): Promise<void> {
  await kv.delete(SNOOZE_KEY);
}

export async function getSnoozeUntil(): Promise<number | null> {
  const result = await kv.get(SNOOZE_KEY);
  if (!result.exists || !result.value) return null;
  return (await result.value) as number;
}
