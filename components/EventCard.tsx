"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { deleteEventAction } from "@/app/actions/events";
import {
  markEventDeletedOptimistically,
  rollbackOptimisticallyDeletedEvent,
  useOptimisticallyDeletedEventIds,
} from "@/lib/optimistic-event-deletions";
import { rotationStyle } from "@/lib/rotation";
import { formatEventTime, formatEventTimestamp } from "@/lib/event-time";
import type { GeckoEvent } from "@/lib/types";

interface EventCardProps {
  event: GeckoEvent;
  onDelete?: (id: string) => void;
  timestampLabel?: string;
  // Selection mode
  selectable?: boolean;
  selected?: boolean;
  onSelect?: (id: string) => void;
}

function formatDuration(seconds: number): string {
  const s = Math.round(seconds);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

export default function EventCard({
  event,
  onDelete,
  timestampLabel = formatEventTimestamp(event.timestamp),
  selectable,
  selected,
  onSelect,
}: EventCardProps) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [imageBroken, setImageBroken] = useState(false);
  const optimisticallyDeletedIds = useOptimisticallyDeletedEventIds();

  if (optimisticallyDeletedIds.has(event.id)) {
    return null;
  }

  async function handleDelete() {
    if (!onDelete) return;
    if (!confirm(`Delete event from ${formatEventTimestamp(event.timestamp)}?`)) return;

    setDeleting(true);
    try {
      markEventDeletedOptimistically(event.id);
      const result = await deleteEventAction(event.id);

      if (result.ok || result.status === 404) {
        onDelete(event.id);
        router.refresh();
        return;
      }

      rollbackOptimisticallyDeletedEvent(event.id);
      const msg = result.status === 401
        ? "Not authorized. Log in first to delete events."
        : "Failed to delete event.";
      alert(msg);
      setDeleting(false);
    } catch {
      rollbackOptimisticallyDeletedEvent(event.id);
      alert("Network error.");
      setDeleting(false);
    }
  }

  const thumbnail = (
    <div className="relative aspect-video bg-black block w-full">
      {imageBroken ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(180,220,180,0.18),_transparent_45%),linear-gradient(135deg,_#17212f,_#0d1117_70%)] text-center text-gray-200">
          <span className="text-2xl">🦎</span>
          <span className="mt-2 text-sm font-medium">Thumbnail unavailable</span>
        </div>
      ) : (
        <Image
          src={event.thumbnailUrl}
          alt={`Motion event at ${formatEventTimestamp(event.timestamp)}`}
          fill
          className="object-cover transition-transform duration-300"
          style={rotationStyle(event.rotation ?? 0)}
          sizes="(max-width: 768px) 100vw, 33vw"
          onError={() => setImageBroken(true)}
        />
      )}
      {selectable ? (
        <div className={`absolute inset-0 transition-colors ${selected ? "bg-blue-500/20" : "hover:bg-white/10"}`}>
          <div className={`absolute top-2 left-2 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors
            ${selected ? "bg-blue-500 border-blue-500" : "border-white/70 bg-black/30"}`}>
            {selected && (
              <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            )}
          </div>
        </div>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur flex items-center justify-center">
            <svg className="w-5 h-5 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
              <title>Play</title>
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className={`bg-gray-800 rounded-lg overflow-hidden group ${selectable ? "cursor-pointer" : ""}`}>
      {selectable ? (
        <button type="button" className="w-full text-left" onClick={() => onSelect?.(event.id)}>
          {thumbnail}
        </button>
      ) : (
        <Link href={`/events/${event.id}`} className="block">
          {thumbnail}
        </Link>
      )}

      <div className="px-3 py-2 flex items-center justify-between">
        <div>
          <p className="text-sm text-white font-medium">{timestampLabel || formatEventTime(event.timestamp)}</p>
          <p className="text-xs text-gray-400 mt-0.5">
            {event.duration ? formatDuration(event.duration) : ""}
            {event.duration && event.motionScore ? " · " : ""}
            {event.motionScore ? `score ${Math.round(event.motionScore)}` : ""}
          </p>
        </div>

        {!selectable && onDelete && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="text-gray-500 hover:text-red-400 transition-colors disabled:opacity-40 p-1"
            title="Delete event"
          >
            {deleting ? (
              <span className="inline-block w-4 h-4 border-2 border-gray-500 border-t-transparent rounded-full animate-spin" aria-hidden />
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <title>Delete event</title>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
