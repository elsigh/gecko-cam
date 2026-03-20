import { put } from "@vercel/blob";
import type { GeckoEvent, Rotation } from "./types";

const MAX_EVENTS = 200;
const PAGE_SIZE = 12;
const DATA_PREFIX = "gecko-cam-data";

// Derive the store's public base URL from BLOB_READ_WRITE_TOKEN.
// Token format: vercel_blob_rw_{storeId}_{hash}
function getStoreBaseUrl(): string {
  const token = process.env.BLOB_READ_WRITE_TOKEN ?? "";
  const storeId = (token.split("_")[3] ?? "").toLowerCase();
  return `https://${storeId}.public.blob.vercel-storage.com`;
}

async function kvGet<T>(key: string): Promise<T | null> {
  try {
    const url = `${getStoreBaseUrl()}/${DATA_PREFIX}/${key}`;
    // Unique t= param busts CDN cache so we always get the latest blob version
    const res = await fetch(`${url}?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return null;
    return res.json() as Promise<T>;
  } catch {
    return null;
  }
}

async function kvSet(key: string, value: unknown): Promise<void> {
  await put(`${DATA_PREFIX}/${key}`, JSON.stringify(value), {
    access: "public",
    addRandomSuffix: false,
    contentType: "application/json",
  });
}

// ── Rotation ──────────────────────────────────────────────────────────────────

export async function getRotation(): Promise<Rotation> {
  const data = await kvGet<{ rotation: number }>("rotation.json");
  const r = data?.rotation ?? 0;
  if (r === 90 || r === 180 || r === 270) return r;
  return 0;
}

export async function setRotation(rotation: Rotation): Promise<void> {
  await kvSet("rotation.json", { rotation });
}

// ── Snooze ────────────────────────────────────────────────────────────────────

export async function setSnooze(untilMs: number): Promise<void> {
  await kvSet("snooze.json", { until: untilMs });
}

export async function clearSnooze(): Promise<void> {
  await kvSet("snooze.json", { until: null });
}

export async function getSnoozeUntil(): Promise<number | null> {
  const data = await kvGet<{ until: number | null }>("snooze.json");
  return data?.until ?? null;
}

// ── Events ────────────────────────────────────────────────────────────────────

async function getAllEvents(): Promise<GeckoEvent[]> {
  const data = await kvGet<GeckoEvent[]>("events.json");
  return data ?? [];
}

export async function saveEvent(event: GeckoEvent): Promise<void> {
  const events = await getAllEvents();
  events.unshift(event);
  await kvSet("events.json", events.slice(0, MAX_EVENTS));
}

export async function listEvents(
  cursor?: string
): Promise<{ events: GeckoEvent[]; nextCursor: string | null }> {
  const allEvents = await getAllEvents();
  const offset = cursor ? parseInt(cursor, 10) : 0;
  const page = allEvents.slice(offset, offset + PAGE_SIZE);
  const hasMore = offset + PAGE_SIZE < allEvents.length;
  return {
    events: page,
    nextCursor: hasMore ? String(offset + PAGE_SIZE) : null,
  };
}

/** Find and remove a single event in one read+write. Returns the removed event or null. */
export async function deleteEvent(id: string): Promise<GeckoEvent | null> {
  const events = await getAllEvents();
  const event = events.find((e) => e.id === id);
  if (!event) return null;
  await kvSet("events.json", events.filter((e) => e.id !== id));
  return event;
}

/** Batch delete — single blob read + single blob write regardless of how many IDs. */
export async function deleteEvents(ids: string[]): Promise<GeckoEvent[]> {
  const idSet = new Set(ids);
  const events = await getAllEvents();
  const removed = events.filter((e) => idSet.has(e.id));
  await kvSet("events.json", events.filter((e) => !idSet.has(e.id)));
  return removed;
}

export async function getEvent(id: string): Promise<GeckoEvent | null> {
  const events = await getAllEvents();
  return events.find((e) => e.id === id) ?? null;
}
