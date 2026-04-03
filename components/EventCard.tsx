"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { deleteEventAction, setFavoriteEventAction } from "@/app/actions/events";
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
  onFavoriteChange?: (id: string, favorite: boolean) => void;
  timestampLabel?: string;
  selectable?: boolean;
  selected?: boolean;
  onSelect?: (id: string) => void;
  canManage?: boolean;
}

function formatDuration(seconds: number): string {
  const s = Math.round(seconds);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

export default function EventCard({
  event,
  onDelete,
  onFavoriteChange,
  timestampLabel = formatEventTimestamp(event.timestamp),
  selectable,
  selected,
  onSelect,
  canManage = false,
}: EventCardProps) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [favoriting, setFavoriting] = useState(false);
  const [favorite, setFavorite] = useState(Boolean(event.favorite));
  const [imageBroken, setImageBroken] = useState(false);
  const optimisticallyDeletedIds = useOptimisticallyDeletedEventIds();

  useEffect(() => {
    setFavorite(Boolean(event.favorite));
  }, [event.favorite]);

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

  async function handleFavorite(e: React.MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    e.stopPropagation();
    if (favoriting) return;

    const previousFavorite = favorite;
    const nextFavorite = !favorite;
    setFavoriting(true);
    setFavorite(nextFavorite);

    try {
      const result = await setFavoriteEventAction(event.id, nextFavorite);
      if (result.ok) {
        const persistedFavorite = Boolean(result.event?.favorite ?? nextFavorite);
        setFavorite(persistedFavorite);
        onFavoriteChange?.(event.id, persistedFavorite);
        router.refresh();
        return;
      }

      setFavorite(previousFavorite);
      alert(result.status === 401 ? "Not authorized." : "Failed to update favorite.");
    } catch {
      setFavorite(previousFavorite);
      alert("Network error.");
    } finally {
      setFavoriting(false);
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
      {canManage && !selectable && (
        <button
          type="button"
          onClick={handleFavorite}
          disabled={favoriting}
          aria-label={favorite ? "Remove favorite" : "Add favorite"}
          title={favorite ? "Remove favorite" : "Add favorite"}
          className={`absolute top-2 right-2 z-10 rounded-full border px-2.5 py-1.5 backdrop-blur transition-colors ${
            favorite
              ? "border-amber-300/60 bg-amber-400/20 text-amber-200"
              : "border-white/20 bg-black/45 text-gray-200 hover:border-white/35 hover:text-white"
          } disabled:opacity-50`}
        >
          {favoriting ? (
            <span className="inline-block h-4 w-4 rounded-full border-2 border-current border-t-transparent animate-spin" aria-hidden />
          ) : (
            <svg className="h-4 w-4" fill={favorite ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.318 4.056a1 1 0 00.95.69h4.266c.969 0 1.371 1.24.588 1.81l-3.452 2.508a1 1 0 00-.364 1.118l1.318 4.056c.3.921-.755 1.688-1.538 1.118l-3.452-2.508a1 1 0 00-1.176 0l-3.452 2.508c-.783.57-1.838-.197-1.539-1.118l1.319-4.056a1 1 0 00-.364-1.118L2.98 9.483c-.783-.57-.38-1.81.588-1.81H7.83a1 1 0 00.95-.69z"
              />
            </svg>
          )}
        </button>
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

        {!selectable && (
          <div className="flex items-center gap-1">
            {favorite && (
              <span className="text-amber-300" title="Favorite" aria-label="Favorite">
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.318 4.056a1 1 0 00.95.69h4.266c.969 0 1.371 1.24.588 1.81l-3.452 2.508a1 1 0 00-.364 1.118l1.318 4.056c.3.921-.755 1.688-1.538 1.118l-3.452-2.508a1 1 0 00-1.176 0l-3.452 2.508c-.783.57-1.838-.197-1.539-1.118l1.319-4.056a1 1 0 00-.364-1.118L2.98 9.483c-.783-.57-.38-1.81.588-1.81H7.83a1 1 0 00.95-.69z" />
                </svg>
              </span>
            )}
            {onDelete && (
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
        )}
      </div>
    </div>
  );
}
