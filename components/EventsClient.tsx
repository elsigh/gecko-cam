"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { deleteEventsAction } from "@/app/actions/events";
import EventCard from "@/components/EventCard";
import TransitionLink from "@/components/TransitionLink";
import { formatEventDate, formatEventTime } from "@/lib/event-time";
import {
  markEventDeletedOptimistically,
  rollbackOptimisticallyDeletedEvent,
  useOptimisticallyDeletedEventIds,
} from "@/lib/optimistic-event-deletions";
import type { GeckoEvent, EventListResponse } from "@/lib/types";
import { NAVIGATION_TRANSITION } from "@/lib/view-transitions";

interface Props {
  initialEvents: GeckoEvent[];
  initialCursor: string | null;
  canManage?: boolean;
  favoritesOnly?: boolean;
  title?: string;
  emptyTitle?: string;
  emptyBody?: string;
  backHref?: string;
  backLabel?: string;
}

export default function EventsClient({
  initialEvents,
  initialCursor,
  canManage = false,
  favoritesOnly = false,
  title = "All Events",
  emptyTitle = "No motion events recorded yet.",
  emptyBody = "Events appear automatically when motion is detected.",
  backHref = "/",
  backLabel = "← Live",
}: Props) {
  const router = useRouter();
  const [events, setEvents] = useState<GeckoEvent[]>(initialEvents);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [loading, setLoading] = useState(false);
  const loaderRef = useRef<HTMLDivElement>(null);

  // Selection state
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [lastClickedIndex, setLastClickedIndex] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const optimisticallyDeletedIds = useOptimisticallyDeletedEventIds();
  const optimisticallyDeletedIdsKey = [...optimisticallyDeletedIds].sort().join(",");
  const visibleEvents = events.filter((event) => (
    !optimisticallyDeletedIds.has(event.id) && (!favoritesOnly || event.favorite)
  ));
  const daySections: Array<{ dateLabel: string; events: GeckoEvent[] }> = [];

  for (const event of visibleEvents) {
    const dateLabel = formatEventDate(event.timestamp);
    const currentSection = daySections.at(-1);
    if (!currentSection || currentSection.dateLabel !== dateLabel) {
      daySections.push({ dateLabel, events: [event] });
      continue;
    }
    currentSection.events.push(event);
  }

  const loadMore = useCallback(async () => {
    if (loading || !cursor) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/events?cursor=${encodeURIComponent(cursor)}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const data: EventListResponse = await res.json();
      setEvents((prev) => [...prev, ...data.events]);
      setCursor(data.nextCursor);
    } catch (err) {
      console.error("Failed to load events:", err);
    } finally {
      setLoading(false);
    }
  }, [loading, cursor]);

  useEffect(() => {
    const deletedIds = new Set(
      optimisticallyDeletedIdsKey ? optimisticallyDeletedIdsKey.split(",") : []
    );

    setSelected((prev) => {
      const next = new Set([...prev].filter((id) => !deletedIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
    setLastClickedIndex(null);
  }, [optimisticallyDeletedIdsKey]);

  useEffect(() => {
    const el = loaderRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && cursor && !loading) {
          void loadMore();
        }
      },
      { rootMargin: "200px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [cursor, loading, loadMore]);

  function handleDelete(id: string) {
    setEvents((prev) => prev.filter((e) => e.id !== id));
    setSelected((prev) => {
      if (!prev.has(id)) return prev;

      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  function handleFavoriteChange(id: string, favorite: boolean) {
    setEvents((prev) => prev.map((event) => (
      event.id === id ? { ...event, favorite } : event
    )));
  }

  function toggleSelect(id: string) {
    const index = visibleEvents.findIndex((event) => event.id === id);
    if (index === -1) return;

    if (lastClickedIndex !== null && lastClickedIndex !== index) {
      const lo = Math.min(lastClickedIndex, index);
      const hi = Math.max(lastClickedIndex, index);
      setSelected((prev) => {
        const next = new Set(prev);
        for (let i = lo; i <= hi; i++) next.add(visibleEvents[i].id);
        return next;
      });
    } else {
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        return next;
      });
    }
    setLastClickedIndex(index);
  }

  function selectAll() {
    setSelected(new Set(visibleEvents.map((event) => event.id)));
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelected(new Set());
  }

  async function deleteSelected() {
    if (selected.size === 0) return;
    if (!confirm(`Delete ${selected.size} event${selected.size === 1 ? "" : "s"}?`)) return;

    setDeleting(true);
    const ids = [...selected];

    for (const id of ids) {
      markEventDeletedOptimistically(id);
    }

    try {
      const result = await deleteEventsAction(ids);
      if (result.ok) {
        setEvents((prev) => prev.filter((e) => !ids.includes(e.id)));
        router.refresh();
        exitSelectMode();
      } else {
        for (const id of ids) {
          rollbackOptimisticallyDeletedEvent(id);
        }
        alert(result.status === 401 ? "Not authorized." : "Failed to delete events.");
        setDeleting(false);
        return;
      }
    } catch {
      for (const id of ids) {
        rollbackOptimisticallyDeletedEvent(id);
      }
      alert("Network error.");
      setDeleting(false);
      return;
    }

    setDeleting(false);
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        {selectMode ? (
          <>
            <button
              onClick={exitSelectMode}
              className="text-gray-400 hover:text-gray-200 transition-colors text-sm"
            >
              Cancel
            </button>
            <h2 className="text-lg font-semibold">
              {selected.size > 0 ? `${selected.size} selected` : "Select events"}
            </h2>
            <button
              onClick={selectAll}
              className="text-xs text-blue-400 hover:text-blue-300 transition-colors ml-auto"
            >
              Select all
            </button>
            <button
              onClick={deleteSelected}
              disabled={selected.size === 0 || deleting}
              className="text-xs bg-red-600 hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed text-white px-3 py-1.5 rounded transition-colors flex items-center gap-1.5"
            >
              {deleting ? (
                <span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              )}
              Delete {selected.size > 0 ? selected.size : ""}
            </button>
          </>
        ) : (
          <>
            <TransitionLink
              href={backHref}
              transitionTypes={[NAVIGATION_TRANSITION]}
              className="text-gray-400 hover:text-gray-200 transition-colors text-sm"
            >
              {backLabel}
            </TransitionLink>
            <h2 className="text-lg font-semibold">{title}</h2>
            {visibleEvents.length > 0 && canManage && (
              <button
                onClick={() => setSelectMode(true)}
                className="ml-auto text-xs text-gray-400 hover:text-gray-200 transition-colors"
              >
                Select
              </button>
            )}
          </>
        )}
      </div>

      {visibleEvents.length === 0 && !cursor && (
        <div className="text-center py-20">
          <p className="text-gray-500">{favoritesOnly ? "No favorite clips yet." : emptyTitle}</p>
          <p className="text-gray-600 text-sm mt-1">
            {favoritesOnly ? "Star the clips you want to keep handy, and they will show up here." : emptyBody}
          </p>
        </div>
      )}

      <div className="space-y-8">
        {daySections.map((section, index) => (
          <section key={section.dateLabel}>
            {index > 0 && <hr className="mb-6 border-gray-800" />}
            <div className="mb-4 flex items-center gap-3">
              <h3 className="text-sm font-semibold uppercase tracking-[0.24em] text-gray-400">
                {section.dateLabel}
              </h3>
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {section.events.map((event) => (
                <EventCard
                  key={event.id}
                  event={event}
                  timestampLabel={formatEventTime(event.timestamp)}
                  onDelete={canManage && !selectMode ? handleDelete : undefined}
                  onFavoriteChange={handleFavoriteChange}
                  selectable={selectMode}
                  selected={selected.has(event.id)}
                  onSelect={toggleSelect}
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      <div ref={loaderRef} className="h-12 flex items-center justify-center mt-4">
        {!favoritesOnly && loading && (
          <span className="inline-block w-5 h-5 border-2 border-gray-600 border-t-gray-300 rounded-full animate-spin" />
        )}
      </div>
    </div>
  );
}
