import { put } from "@vercel/blob";
import type { GeckoEvent, Rotation } from "./types";

const MAX_EVENTS = 200;
const PAGE_SIZE = 12;
const BLOB_PREFIX = "gecko-cam-data";
const ROTATION_FILENAME = "rotation-v3.json";
const FAVORITES_FILENAME = "favorites.json";

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
  const data = await readBlob<{ rotation: number }>(ROTATION_FILENAME);
  const r = data?.rotation ?? 0;
  if (r === 90 || r === 180 || r === 270) return r;
  return 0;
}

export async function setRotation(rotation: Rotation): Promise<void> {
  await writeBlob(ROTATION_FILENAME, { rotation });
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

async function readFavoriteIds(): Promise<Set<string>> {
  const ids = await readBlob<string[]>(FAVORITES_FILENAME);
  return new Set(Array.isArray(ids) ? ids : []);
}

async function writeFavoriteIds(ids: Set<string>): Promise<void> {
  await writeBlob(FAVORITES_FILENAME, [...ids]);
}

function applyFavorites(events: GeckoEvent[], favoriteIds: Set<string>): GeckoEvent[] {
  return events.map((event) => ({
    ...event,
    favorite: favoriteIds.has(event.id) || Boolean(event.favorite),
  }));
}

export async function listAllEvents(): Promise<GeckoEvent[]> {
  const [events, favoriteIds] = await Promise.all([readEvents(), readFavoriteIds()]);
  return applyFavorites(events, favoriteIds);
}

export async function saveEvent(event: GeckoEvent): Promise<void> {
  const events = await readEvents();
  const newList = [event, ...events.filter((e) => e.id !== event.id)].slice(0, MAX_EVENTS);
  await writeBlob("events.json", newList);
}

export async function setEventRotation(
  id: string,
  rotation: Rotation
): Promise<GeckoEvent | null> {
  const events = await readEvents();
  let updated: GeckoEvent | null = null;

  const nextEvents = events.map((event) => {
    if (event.id !== id) return event;
    updated = { ...event, rotation };
    return updated;
  });

  if (!updated) return null;

  await writeBlob("events.json", nextEvents);
  return updated;
}

export async function setEventFavorite(
  id: string,
  favorite: boolean
): Promise<GeckoEvent | null> {
  const [events, favoriteIds] = await Promise.all([readEvents(), readFavoriteIds()]);
  const event = events.find((current) => current.id === id);
  if (!event) return null;

  if (favorite) {
    favoriteIds.add(id);
  } else {
    favoriteIds.delete(id);
  }

  await writeFavoriteIds(favoriteIds);
  return { ...event, favorite };
}

export async function listEvents(
  cursor?: string
): Promise<{ events: GeckoEvent[]; nextCursor: string | null }> {
  const [storedEvents, favoriteIds] = await Promise.all([readEvents(), readFavoriteIds()]);
  const allEvents = applyFavorites(storedEvents, favoriteIds);
  const offset = cursor ? parseInt(cursor, 10) : 0;
  const page = allEvents.slice(offset, offset + PAGE_SIZE);
  const hasMore = offset + PAGE_SIZE < allEvents.length;
  return {
    events: page,
    nextCursor: hasMore ? String(offset + PAGE_SIZE) : null,
  };
}

export async function deleteEvent(id: string): Promise<GeckoEvent | null> {
  const [events, favoriteIds] = await Promise.all([readEvents(), readFavoriteIds()]);
  const event = events.find((e) => e.id === id);
  if (!event) return null;
  favoriteIds.delete(id);
  await Promise.all([
    writeBlob("events.json", events.filter((e) => e.id !== id)),
    writeFavoriteIds(favoriteIds),
  ]);
  return { ...event, favorite: favoriteIds.has(id) || Boolean(event.favorite) };
}

export async function deleteEvents(ids: string[]): Promise<GeckoEvent[]> {
  const idSet = new Set(ids);
  const [events, favoriteIds] = await Promise.all([readEvents(), readFavoriteIds()]);
  const removed = events.filter((e) => idSet.has(e.id));
  if (removed.length === 0) return [];
  for (const id of idSet) favoriteIds.delete(id);
  await Promise.all([
    writeBlob("events.json", events.filter((e) => !idSet.has(e.id))),
    writeFavoriteIds(favoriteIds),
  ]);
  return removed.map((event) => ({
    ...event,
    favorite: favoriteIds.has(event.id) || Boolean(event.favorite),
  }));
}

export async function getEvent(id: string): Promise<GeckoEvent | null> {
  const [events, favoriteIds] = await Promise.all([readEvents(), readFavoriteIds()]);
  const event = events.find((e) => e.id === id);
  if (!event) return null;
  return {
    ...event,
    favorite: favoriteIds.has(id) || Boolean(event.favorite),
  };
}
