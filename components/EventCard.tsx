"use client";

import { useState } from "react";
import Image from "next/image";
import type { GeckoEvent } from "@/lib/types";

interface EventCardProps {
  event: GeckoEvent;
  onDelete?: (id: string) => void;
  apiSecret?: string;
}

function formatDate(timestamp: number): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(timestamp));
}

function formatDuration(seconds: number): string {
  const s = Math.round(seconds);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

export default function EventCard({ event, onDelete, apiSecret }: EventCardProps) {
  const [playing, setPlaying] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!onDelete || !apiSecret) return;
    if (!confirm("Delete this event?")) return;

    setDeleting(true);
    try {
      const res = await fetch(`/api/events/${event.id}`, {
        method: "DELETE",
        headers: { "x-api-secret": apiSecret },
      });
      if (res.ok) {
        onDelete(event.id);
      } else {
        alert("Failed to delete event.");
        setDeleting(false);
      }
    } catch {
      alert("Network error.");
      setDeleting(false);
    }
  }

  return (
    <div className="bg-gray-800 rounded-lg overflow-hidden group">
      <div className="relative aspect-video bg-black cursor-pointer" onClick={() => setPlaying(!playing)}>
        {playing ? (
          <video
            src={event.clipUrl}
            className="w-full h-full object-contain"
            controls
            autoPlay
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <>
            <Image
              src={event.thumbnailUrl}
              alt={`Motion event at ${formatDate(event.timestamp)}`}
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 33vw"
            />
            <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur flex items-center justify-center">
                <svg className="w-5 h-5 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>
            </div>
          </>
        )}
      </div>

      <div className="px-3 py-2 flex items-center justify-between">
        <div>
          <p className="text-sm text-white font-medium">{formatDate(event.timestamp)}</p>
          <p className="text-xs text-gray-400 mt-0.5">
            {event.duration ? formatDuration(event.duration) : ""}
            {event.duration && event.motionScore ? " · " : ""}
            {event.motionScore ? `score ${Math.round(event.motionScore)}` : ""}
          </p>
        </div>

        {onDelete && (
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="text-gray-500 hover:text-red-400 transition-colors disabled:opacity-40 p-1"
            title="Delete event"
          >
            {deleting ? (
              <span className="inline-block w-4 h-4 border-2 border-gray-500 border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
