"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import EventCard from "@/components/EventCard";
import type { GeckoEvent, EventListResponse } from "@/lib/types";

interface Props {
  initialEvents: GeckoEvent[];
  initialCursor: string | null;
}

export default function EventsClient({ initialEvents, initialCursor }: Props) {
  const [events, setEvents] = useState<GeckoEvent[]>(initialEvents);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [loading, setLoading] = useState(false);
  const loaderRef = useRef<HTMLDivElement>(null);

  // Selection state
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [lastClickedIndex, setLastClickedIndex] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

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
    const el = loaderRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && cursor && !loading) loadMore();
      },
      { rootMargin: "200px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [cursor, loading, loadMore]);

  function handleDelete(id: string) {
    setEvents((prev) => prev.filter((e) => e.id !== id));
  }

  function toggleSelect(id: string) {
    const index = events.findIndex((e) => e.id === id);
    if (lastClickedIndex !== null && lastClickedIndex !== index) {
      const lo = Math.min(lastClickedIndex, index);
      const hi = Math.max(lastClickedIndex, index);
      setSelected((prev) => {
        const next = new Set(prev);
        for (let i = lo; i <= hi; i++) next.add(events[i].id);
        return next;
      });
    } else {
      setSelected((prev) => {
        const next = new Set(prev);
        next.has(id) ? next.delete(id) : next.add(id);
        return next;
      });
    }
    setLastClickedIndex(index);
  }

  function selectAll() {
    setSelected(new Set(events.map((e) => e.id)));
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
    try {
      const res = await fetch("/api/events", {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (res.ok) {
        setEvents((prev) => prev.filter((e) => !ids.includes(e.id)));
      } else {
        alert(res.status === 401 ? "Not authorized." : "Failed to delete events.");
      }
    } catch {
      alert("Network error.");
    }
    setDeleting(false);
    exitSelectMode();
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
            <Link href="/" className="text-gray-400 hover:text-gray-200 transition-colors text-sm">
              ← Live
            </Link>
            <h2 className="text-lg font-semibold">All Events</h2>
            {events.length > 0 && (
              <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded-full">
                {events.length}{cursor ? "+" : ""}
              </span>
            )}
            {events.length > 0 && (
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

      {events.length === 0 && !cursor && (
        <div className="text-center py-20">
          <p className="text-gray-500">No motion events recorded yet.</p>
          <p className="text-gray-600 text-sm mt-1">
            Events appear automatically when motion is detected.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {events.map((event) => (
          <EventCard
            key={event.id}
            event={event}
            onDelete={selectMode ? undefined : handleDelete}
            selectable={selectMode}
            selected={selected.has(event.id)}
            onSelect={toggleSelect}
          />
        ))}
      </div>

      <div ref={loaderRef} className="h-12 flex items-center justify-center mt-4">
        {loading && (
          <span className="inline-block w-5 h-5 border-2 border-gray-600 border-t-gray-300 rounded-full animate-spin" />
        )}
      </div>
    </div>
  );
}
