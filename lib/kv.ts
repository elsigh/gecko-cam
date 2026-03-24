import { put } from "@vercel/blob";
import type { GeckoEvent, Rotation } from "./types";

const MAX_EVENTS = 200;
const PAGE_SIZE = 12;
const BLOB_PREFIX = "gecko-cam-data";

function getBaseUrl(): string {
  const token = process.env.BLOB_READ_WRITE_TOKEN ?? "";
  const storeId = (token.split("_")[3] ?? "").toLowerCase();
  return `https://${storeId}.public.blob.vercel-storage.com`;
}

async function readBlob<T>(filename: string): Promise<T | null> {
  try {
    // Append a timestamp to bypass Vercel Blob's CDN cache on every read.
    // All callers are in API routes, inside <Suspense>, or inside "use cache"
    // boundaries, so Date.now() is safe at runtime (no prerender errors).
    const url = `${getBaseUrl()}/${BLOB_PREFIX}/${filename}?_t=${Date.now()}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    return res.json() as Promise<T>;
  } catch {
    return null;
  }
}

async function writeBlob(filename: string, data: unknown): Promise<void> {
  await put(`${BLOB_PREFIX}/${filename}`, JSON.stringify(data), {
    access: "public",
    addRandomSuffix: false,
    contentType: "application/json",
  });
}

// ── Rotation ──────────────────────────────────────────────────────────────────

export async function getRotation(): Promise<Rotation> {
  const data = await readBlob<{ rotation: number }>("rotation.json");
  const r = data?.rotation ?? 0;
  if (r === 90 || r === 180 || r === 270) return r;
  return 0;
}

export async function setRotation(rotation: Rotation): Promise<void> {
  await writeBlob("rotation.json", { rotation });
}

// ── Snooze ────────────────────────────────────────────────────────────────────

export async function setSnooze(untilMs: number): Promise<void> {
  await writeBlob("snooze.json", { until: untilMs });
}

export async function clearSnooze(): Promise<void> {
  await writeBlob("snooze.json", { until: null });
}

export async function getSnoozeUntil(): Promise<number | null> {
  const data = await readBlob<{ until: number | null }>("snooze.json");
  return data?.until ?? null;
}

// ── Events ────────────────────────────────────────────────────────────────────

async function readEvents(): Promise<GeckoEvent[]> {
  const events = await readBlob<GeckoEvent[]>("events.json");
  return events ?? [];
}

export async function saveEvent(event: GeckoEvent): Promise<void> {
  const events = await readEvents();
  const newList = [event, ...events.filter((e) => e.id !== event.id)].slice(0, MAX_EVENTS);
  await writeBlob("events.json", newList);
}

export async function listEvents(
  cursor?: string
): Promise<{ events: GeckoEvent[]; nextCursor: string | null }> {
  const allEvents = await readEvents();
  const offset = cursor ? parseInt(cursor, 10) : 0;
  const page = allEvents.slice(offset, offset + PAGE_SIZE);
  const hasMore = offset + PAGE_SIZE < allEvents.length;
  return {
    events: page,
    nextCursor: hasMore ? String(offset + PAGE_SIZE) : null,
  };
}

export async function deleteEvent(id: string): Promise<GeckoEvent | null> {
  const events = await readEvents();
  const event = events.find((e) => e.id === id);
  if (!event) return null;
  await writeBlob("events.json", events.filter((e) => e.id !== id));
  return event;
}

export async function deleteEvents(ids: string[]): Promise<GeckoEvent[]> {
  const idSet = new Set(ids);
  const events = await readEvents();
  const removed = events.filter((e) => idSet.has(e.id));
  if (removed.length === 0) return [];
  await writeBlob("events.json", events.filter((e) => !idSet.has(e.id)));
  return removed;
}

export async function getEvent(id: string): Promise<GeckoEvent | null> {
  const events = await readEvents();
  return events.find((e) => e.id === id) ?? null;
}
