import { createKV, KVVersionConflictError } from "@vercel/kv2";
import type { GeckoEvent, Rotation } from "./types";

const MAX_EVENTS = 200;
const PAGE_SIZE = 12;
const MAX_RETRIES = 5;

// KV2 instance — auto-detects env/branch, uses BLOB_READ_WRITE_TOKEN,
// falls back to disk storage locally when no token is set.
const kv = createKV({ prefix: "gecko-cam/" });

// ── Migration helpers (one-time read from old public blobs) ───────────────────

const LEGACY_PREFIX = "gecko-cam-data";

function getLegacyBaseUrl(): string {
  const token = process.env.BLOB_READ_WRITE_TOKEN ?? "";
  const storeId = (token.split("_")[3] ?? "").toLowerCase();
  return `https://${storeId}.public.blob.vercel-storage.com`;
}

async function readLegacyBlob<T>(key: string): Promise<T | null> {
  try {
    const url = `${getLegacyBaseUrl()}/${LEGACY_PREFIX}/${key}?t=${Date.now()}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    return res.json() as Promise<T>;
  } catch {
    return null;
  }
}

// ── Rotation ──────────────────────────────────────────────────────────────────

export async function getRotation(): Promise<Rotation> {
  const value = await kv.getValue<{ rotation: number }>("rotation");
  if (value !== undefined) {
    const r = value.rotation;
    if (r === 90 || r === 180 || r === 270) return r;
    return 0;
  }
  // First read — migrate from legacy blob
  const legacy = await readLegacyBlob<{ rotation: number }>("rotation.json");
  const r = legacy?.rotation ?? 0;
  const rotation: Rotation = r === 90 || r === 180 || r === 270 ? r : 0;
  await kv.set("rotation", { rotation }).catch(() => {});
  return rotation;
}

export async function setRotation(rotation: Rotation): Promise<void> {
  await kv.set("rotation", { rotation });
}

// ── Snooze ────────────────────────────────────────────────────────────────────

export async function setSnooze(untilMs: number): Promise<void> {
  await kv.set("snooze", { until: untilMs });
}

export async function clearSnooze(): Promise<void> {
  await kv.set("snooze", { until: null });
}

export async function getSnoozeUntil(): Promise<number | null> {
  const value = await kv.getValue<{ until: number | null }>("snooze");
  if (value !== undefined) return value.until ?? null;
  // First read — migrate from legacy blob
  const legacy = await readLegacyBlob<{ until: number | null }>("snooze.json");
  if (legacy?.until) {
    await kv.set("snooze", { until: legacy.until }).catch(() => {});
    return legacy.until;
  }
  return null;
}

// ── Events ────────────────────────────────────────────────────────────────────

/** Read events entry from KV2, migrating from legacy blob on first use. */
async function getEventsEntry() {
  const entry = await kv.get<GeckoEvent[]>("events");
  if (entry.exists) return entry;

  // KV2 empty — try migrating from old public blob
  const legacy = await readLegacyBlob<GeckoEvent[]>("events.json");
  if (legacy && legacy.length > 0) {
    // Concurrent migrations write the same data — harmless overwrite
    await kv.set("events", legacy.slice(0, MAX_EVENTS)).catch(() => {});
    return kv.get<GeckoEvent[]>("events");
  }

  return entry; // exists: false, no legacy data
}

export async function saveEvent(event: GeckoEvent): Promise<void> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const entry = await getEventsEntry();
    const events = entry.exists ? await entry.value : [];
    const newList = [event, ...events].slice(0, MAX_EVENTS);
    try {
      if (entry.exists) {
        await entry.update(newList);
      } else {
        // First ever write — no version to check; rare race is acceptable
        await kv.set("events", newList);
      }
      return;
    } catch (e) {
      if (e instanceof KVVersionConflictError) continue;
      throw e;
    }
  }
  throw new Error(`saveEvent: max retries exceeded (${MAX_RETRIES})`);
}

export async function listEvents(
  cursor?: string
): Promise<{ events: GeckoEvent[]; nextCursor: string | null }> {
  const entry = await getEventsEntry();
  const allEvents = entry.exists ? await entry.value : [];
  const offset = cursor ? parseInt(cursor, 10) : 0;
  const page = allEvents.slice(offset, offset + PAGE_SIZE);
  const hasMore = offset + PAGE_SIZE < allEvents.length;
  return {
    events: page,
    nextCursor: hasMore ? String(offset + PAGE_SIZE) : null,
  };
}

/** Find and remove a single event with optimistic locking. Returns removed event or null. */
export async function deleteEvent(id: string): Promise<GeckoEvent | null> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const entry = await getEventsEntry();
    if (!entry.exists) return null;
    const events = await entry.value;
    const event = events.find((e) => e.id === id);
    if (!event) return null;
    try {
      await entry.update(events.filter((e) => e.id !== id));
      return event;
    } catch (e) {
      if (e instanceof KVVersionConflictError) continue;
      throw e;
    }
  }
  throw new Error(`deleteEvent: max retries exceeded (${MAX_RETRIES})`);
}

/** Batch delete with optimistic locking — single read+write regardless of batch size. */
export async function deleteEvents(ids: string[]): Promise<GeckoEvent[]> {
  const idSet = new Set(ids);
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const entry = await getEventsEntry();
    if (!entry.exists) return [];
    const events = await entry.value;
    const removed = events.filter((e) => idSet.has(e.id));
    if (removed.length === 0) return [];
    try {
      await entry.update(events.filter((e) => !idSet.has(e.id)));
      return removed;
    } catch (e) {
      if (e instanceof KVVersionConflictError) continue;
      throw e;
    }
  }
  throw new Error(`deleteEvents: max retries exceeded (${MAX_RETRIES})`);
}

export async function getEvent(id: string): Promise<GeckoEvent | null> {
  const entry = await getEventsEntry();
  if (!entry.exists) return null;
  const events = await entry.value;
  return events.find((e) => e.id === id) ?? null;
}
