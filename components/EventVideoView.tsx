"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { deleteEventAction } from "@/app/actions/events";
import type { GeckoEvent } from "@/lib/types";
import { rotationStyle } from "@/lib/useStreamRotation";

interface EventVideoViewProps {
  event: GeckoEvent;
  backHref?: string;
  backLabel?: string;
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

export default function EventVideoView({
  event,
  backHref = "/",
  backLabel = "Back to Live",
}: EventVideoViewProps) {
  const router = useRouter();
  const containerRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && document.fullscreenElement) {
        document.exitFullscreen();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    function handleFullscreenChange() {
      setIsFullscreen(!!document.fullscreenElement);
    }
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  async function toggleFullscreen() {
    const el = containerRef.current;
    if (!el) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await el.requestFullscreen();
      }
    } catch (err) {
      console.warn("Fullscreen not supported or denied:", err);
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete event from ${formatDate(event.timestamp)}?`)) return;

    setDeleting(true);

    try {
      const result = await deleteEventAction(event.id);
      if (result.ok || result.status === 404) {
        if (typeof window !== "undefined") {
          window.location.replace(backHref);
        } else {
          router.replace(backHref);
        }
        return;
      }

      const msg = result.status === 401
        ? "Not authorized. Log in first to delete events."
        : "Failed to delete event.";
      alert(msg);
      setDeleting(false);
    } catch {
      alert("Network error.");
      setDeleting(false);
    }
  }

  return (
    <section
      ref={containerRef}
      className="flex flex-col min-h-[80vh] bg-black rounded-lg"
      aria-label={`Watch event from ${formatDate(event.timestamp)}`}
    >
      <div className="flex items-center justify-between p-3 bg-gray-900/90 border-b border-gray-800">
        {deleting ? (
          <span className="flex items-center gap-2 text-gray-500 text-sm cursor-wait">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <title>Back</title>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            {backLabel}
          </span>
        ) : (
          <Link
            href={backHref}
            className="flex items-center gap-2 text-gray-300 hover:text-white transition-colors text-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <title>Back</title>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            {backLabel}
          </Link>
        )}
        <p className="text-sm text-white/90 truncate">
          {formatDate(event.timestamp)}
        </p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="p-2 rounded-lg text-gray-400 hover:text-red-400 hover:bg-white/10 disabled:opacity-40 transition-colors"
            title="Delete event"
            aria-label="Delete event"
          >
            {deleting ? (
              <span className="inline-block w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" aria-hidden />
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <title>Delete event</title>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            )}
          </button>
          <button
            type="button"
            onClick={toggleFullscreen}
            disabled={deleting}
            className="p-2 rounded-lg text-gray-300 hover:text-white hover:bg-white/10 transition-colors"
            title="Fullscreen"
            aria-label="Toggle fullscreen"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <title>Toggle fullscreen</title>
              {isFullscreen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
              )}
            </svg>
          </button>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center min-h-0 p-4">
        <video
          ref={videoRef}
          src={event.clipUrl}
          className="max-w-full max-h-full object-contain transition-transform duration-300"
          style={rotationStyle(event.rotation ?? 0)}
          controls
          autoPlay
          playsInline
        >
          <track kind="captions" />
        </video>
      </div>
    </section>
  );
}
