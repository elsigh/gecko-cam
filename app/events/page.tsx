"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import EventCard from "@/components/EventCard";
import type { GeckoEvent, EventListResponse } from "@/lib/types";

export default function EventsPage() {
  const [events, setEvents] = useState<GeckoEvent[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const loaderRef = useRef<HTMLDivElement>(null);

  const loadMore = useCallback(async (nextCursor?: string | null) => {
    if (loading) return;
    setLoading(true);
    try {
      const url = nextCursor
        ? `/api/events?cursor=${encodeURIComponent(nextCursor)}`
        : "/api/events";
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch");
      const data: EventListResponse = await res.json();
      setEvents((prev) => [...prev, ...data.events]);
      setCursor(data.nextCursor);
    } catch (err) {
      console.error("Failed to load events:", err);
    } finally {
      setLoading(false);
      setInitialLoaded(true);
    }
  }, [loading]);

  // Initial load
  useEffect(() => {
    loadMore(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Infinite scroll observer
  useEffect(() => {
    const el = loaderRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && cursor && !loading) {
          loadMore(cursor);
        }
      },
      { rootMargin: "200px" }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [cursor, loading, loadMore]);

  function handleDelete(id: string) {
    setEvents((prev) => prev.filter((e) => e.id !== id));
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Link
          href="/"
          className="text-gray-400 hover:text-gray-200 transition-colors text-sm"
        >
          ← Live
        </Link>
        <h2 className="text-lg font-semibold">All Events</h2>
        {events.length > 0 && (
          <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded-full">
            {events.length}{cursor ? "+" : ""}
          </span>
        )}
      </div>

      {initialLoaded && events.length === 0 && (
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
            onDelete={handleDelete}
          />
        ))}
      </div>

      {/* Infinite scroll sentinel */}
      <div ref={loaderRef} className="h-12 flex items-center justify-center mt-4">
        {loading && (
          <span className="inline-block w-5 h-5 border-2 border-gray-600 border-t-gray-300 rounded-full animate-spin" />
        )}
      </div>
    </div>
  );
}
