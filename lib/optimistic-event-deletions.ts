"use client";

import { useSyncExternalStore } from "react";

const STORAGE_KEY = "gecko-cam:optimistically-deleted-events";
const CHANGE_EVENT = "gecko-cam:optimistic-event-deletions";
const EMPTY_IDS: string[] = [];
const STALE_MS = 60_000;

const listeners = new Set<() => void>();
let cachedRaw: string | null = null;
let cachedIds: string[] = EMPTY_IDS;

function canUseSessionStorage(): boolean {
  return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";
}

function readIds(): string[] {
  if (!canUseSessionStorage()) return EMPTY_IDS;

  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (raw === cachedRaw) return cachedIds;
    if (!raw) {
      cachedRaw = null;
      cachedIds = EMPTY_IDS;
      return cachedIds;
    }

    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      // Clear legacy array-only payloads so stale optimistic deletions do not
      // survive forever across unrelated page views.
      window.sessionStorage.removeItem(STORAGE_KEY);
      cachedRaw = null;
      cachedIds = EMPTY_IDS;
      return cachedIds;
    }

    if (!parsed || typeof parsed !== "object") {
      cachedRaw = raw;
      cachedIds = EMPTY_IDS;
      return cachedIds;
    }

    const parsedState = parsed as { ids?: unknown; updatedAt?: unknown };
    if (!Array.isArray(parsedState.ids) || typeof parsedState.updatedAt !== "number") {
      cachedRaw = raw;
      cachedIds = EMPTY_IDS;
      return cachedIds;
    }

    if (Date.now() - parsedState.updatedAt > STALE_MS) {
      window.sessionStorage.removeItem(STORAGE_KEY);
      cachedRaw = null;
      cachedIds = EMPTY_IDS;
      return cachedIds;
    }

    const next = parsedState.ids.filter((value): value is string => typeof value === "string");
    cachedRaw = raw;
    cachedIds = next.length > 0 ? next : EMPTY_IDS;
    return cachedIds;
  } catch {
    cachedRaw = null;
    cachedIds = EMPTY_IDS;
    return cachedIds;
  }
}

function emitChange() {
  for (const listener of listeners) listener();

  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }
}

function writeIds(ids: Iterable<string>) {
  if (!canUseSessionStorage()) return;

  const next = [...new Set(ids)].filter(Boolean);
  if (next.length === 0) {
    window.sessionStorage.removeItem(STORAGE_KEY);
    cachedRaw = null;
    cachedIds = EMPTY_IDS;
    emitChange();
    return;
  }

  const raw = JSON.stringify({ ids: next, updatedAt: Date.now() });
  window.sessionStorage.setItem(STORAGE_KEY, raw);
  cachedRaw = raw;
  cachedIds = next.length > 0 ? next : EMPTY_IDS;
  emitChange();
}

function updateIds(updater: (ids: Set<string>) => void) {
  const next = new Set(readIds());
  updater(next);
  writeIds(next);
}

function subscribe(listener: () => void) {
  listeners.add(listener);

  if (typeof window !== "undefined") {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) {
        listener();
      }
    };
    const handleChange = () => listener();

    window.addEventListener("storage", handleStorage);
    window.addEventListener(CHANGE_EVENT, handleChange);

    return () => {
      listeners.delete(listener);
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(CHANGE_EVENT, handleChange);
    };
  }

  return () => {
    listeners.delete(listener);
  };
}

export function markEventDeletedOptimistically(id: string) {
  if (!id) return;

  updateIds((ids) => {
    ids.add(id);
  });
}

export function rollbackOptimisticallyDeletedEvent(id: string) {
  if (!id) return;

  updateIds((ids) => {
    ids.delete(id);
  });
}

export function useOptimisticallyDeletedEventIds(): Set<string> {
  const ids = useSyncExternalStore(subscribe, readIds, () => EMPTY_IDS);
  return new Set(ids);
}
