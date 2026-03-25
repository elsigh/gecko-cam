"use client";

import { useSyncExternalStore } from "react";

const STORAGE_KEY = "gecko-cam:optimistically-deleted-events";
const CHANGE_EVENT = "gecko-cam:optimistic-event-deletions";

const listeners = new Set<() => void>();

function canUseSessionStorage(): boolean {
  return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";
}

function readIds(): string[] {
  if (!canUseSessionStorage()) return [];

  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter((value): value is string => typeof value === "string");
  } catch {
    return [];
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
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
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
  const ids = useSyncExternalStore(subscribe, readIds, () => []);
  return new Set(ids);
}
