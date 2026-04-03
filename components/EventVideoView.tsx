"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { deleteEventAction, rotateEventAction, setFavoriteEventAction } from "@/app/actions/events";
import {
  markEventDeletedOptimistically,
  rollbackOptimisticallyDeletedEvent,
} from "@/lib/optimistic-event-deletions";
import { formatEventTimestamp } from "@/lib/event-time";
import { rotationStyle } from "@/lib/rotation";
import type { GeckoEvent, Rotation } from "@/lib/types";

interface EventNavigationTarget {
  id: string;
  timestamp: number;
}

interface EventNavigation {
  older: EventNavigationTarget | null;
  newer: EventNavigationTarget | null;
}

interface EventVideoViewProps {
  event: GeckoEvent;
  navigation?: EventNavigation;
  backHref?: string;
  backLabel?: string;
  canDelete?: boolean;
}

export default function EventVideoView({
  event,
  navigation,
  backHref = "/",
  backLabel = "Back to Live",
  canDelete = true,
}: EventVideoViewProps) {
  const router = useRouter();
  const containerRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [rotation, setRotation] = useState<Rotation>(event.rotation ?? 0);
  const [favorite, setFavorite] = useState(Boolean(event.favorite));
  const [favoriting, setFavoriting] = useState(false);
  const [mediaError, setMediaError] = useState(false);

  useEffect(() => {
    setRotation(event.rotation ?? 0);
    setFavorite(Boolean(event.favorite));
    setRotating(false);
    setFavoriting(false);
    setMediaError(false);
  }, [event.favorite, event.id, event.rotation]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target;
      if (
        target instanceof HTMLElement &&
        (target.closest("input, textarea, select, button, a, video") ||
          target.isContentEditable)
      ) {
        return;
      }

      if (e.key === "Escape" && document.fullscreenElement) {
        void document.exitFullscreen();
        return;
      }

      if (deleting || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;

      if (e.key === "ArrowLeft" && navigation?.older) {
        e.preventDefault();
        router.push(`/events/${navigation.older.id}`);
      }

      if (e.key === "ArrowRight" && navigation?.newer) {
        e.preventDefault();
        router.push(`/events/${navigation.newer.id}`);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [deleting, navigation, router]);

  useEffect(() => {
    function handleFullscreenChange() {
      setIsFullscreen(!!document.fullscreenElement);
    }
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  useEffect(() => {
    if (navigation?.older) {
      router.prefetch(`/events/${navigation.older.id}`);
    }
    if (navigation?.newer) {
      router.prefetch(`/events/${navigation.newer.id}`);
    }
  }, [navigation, router]);

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
    if (!confirm(`Delete event from ${formatEventTimestamp(event.timestamp)}?`)) return;

    setDeleting(true);
    markEventDeletedOptimistically(event.id);

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
      rollbackOptimisticallyDeletedEvent(event.id);
      alert(msg);
      setDeleting(false);
    } catch {
      rollbackOptimisticallyDeletedEvent(event.id);
      alert("Network error.");
      setDeleting(false);
    }
  }

  async function handleRotate() {
    if (rotating) return;

    const previousRotation = rotation;
    const nextRotation = ((rotation + 90) % 360) as Rotation;

    setRotating(true);
    setRotation(nextRotation);

    try {
      const result = await rotateEventAction(event.id, nextRotation);
      if (result.ok) {
        setRotation(result.event?.rotation ?? nextRotation);
        router.refresh();
        return;
      }

      setRotation(previousRotation);
      const msg = result.status === 401
        ? "Not authorized. Log in first to rotate events."
        : "Failed to rotate event.";
      alert(msg);
    } catch {
      setRotation(previousRotation);
      alert("Network error.");
    } finally {
      setRotating(false);
    }
  }

  async function handleFavorite() {
    if (favoriting) return;

    const previousFavorite = favorite;
    const nextFavorite = !favorite;
    setFavoriting(true);
    setFavorite(nextFavorite);

    try {
      const result = await setFavoriteEventAction(event.id, nextFavorite);
      if (result.ok) {
        setFavorite(Boolean(result.event?.favorite ?? nextFavorite));
        router.refresh();
        return;
      }

      setFavorite(previousFavorite);
      alert(result.status === 401
        ? "Not authorized. Log in first to favorite events."
        : "Failed to update favorite.");
    } catch {
      setFavorite(previousFavorite);
      alert("Network error.");
    } finally {
      setFavoriting(false);
    }
  }

  function NavigationButton({
    href,
    label,
    timestamp,
    direction,
  }: {
    href: string;
    label: string;
    timestamp: number;
    direction: "left" | "right";
  }) {
    const iconPath = direction === "left"
      ? "M15 19l-7-7 7-7"
      : "M9 5l7 7-7 7";

    return (
      <Link
        href={href}
        className="group flex min-w-0 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-left text-gray-200 transition-colors hover:border-white/20 hover:bg-white/10 hover:text-white"
      >
        {direction === "left" && (
          <svg className="h-4 w-4 shrink-0 text-gray-400 group-hover:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={iconPath} />
          </svg>
        )}
        <span className="min-w-0">
          <span className="block text-[11px] font-medium uppercase tracking-[0.24em] text-gray-500 group-hover:text-gray-300">
            {label}
          </span>
          <span className="block truncate text-sm text-white/90">
            {formatEventTimestamp(timestamp)}
          </span>
        </span>
        {direction === "right" && (
          <svg className="h-4 w-4 shrink-0 text-gray-400 group-hover:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={iconPath} />
          </svg>
        )}
      </Link>
    );
  }

  return (
    <section
      ref={containerRef}
      className="flex flex-col min-h-[80vh] bg-black rounded-lg"
      aria-label={`Watch event from ${formatEventTimestamp(event.timestamp)}`}
    >
      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-gray-800 bg-gray-900/90 p-3">
        <div className="min-w-0">
          {deleting ? (
            <span className="flex items-center gap-2 text-sm text-gray-500 cursor-wait">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <title>Back</title>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              {backLabel}
            </span>
          ) : (
            <Link
              href={backHref}
              className="flex items-center gap-2 text-sm text-gray-300 transition-colors hover:text-white"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <title>Back</title>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              {backLabel}
            </Link>
          )}
        </div>

        <div className="flex min-w-0 justify-center">
          <div className="flex min-w-0 flex-wrap items-center justify-center gap-2">
            {navigation?.older && (
              <NavigationButton
                href={`/events/${navigation.older.id}`}
                label="Before"
                timestamp={navigation.older.timestamp}
                direction="left"
              />
            )}

            <div className="min-w-0 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-center">
              <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-gray-500">
                This Event
              </p>
              <p className="truncate text-sm text-white/90">
                {formatEventTimestamp(event.timestamp)}
              </p>
              {favorite && (
                <p className="text-[11px] uppercase tracking-[0.24em] text-amber-300">
                  Favorited
                </p>
              )}
            </div>

            {navigation?.newer && (
              <NavigationButton
                href={`/events/${navigation.newer.id}`}
                label="After"
                timestamp={navigation.newer.timestamp}
                direction="right"
              />
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-1">
          {canDelete && (
            <button
              type="button"
              onClick={handleFavorite}
              disabled={deleting || favoriting}
              className={`p-2 rounded-lg transition-colors disabled:opacity-40 ${
                favorite
                  ? "text-amber-300 hover:text-amber-200 hover:bg-amber-400/10"
                  : "text-gray-300 hover:text-white hover:bg-white/10"
              }`}
              title={favorite ? "Remove favorite" : "Add favorite"}
              aria-label={favorite ? "Remove favorite" : "Add favorite"}
            >
              {favoriting ? (
                <span className="inline-block w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" aria-hidden />
              ) : (
                <svg className="w-5 h-5" fill={favorite ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <title>{favorite ? "Favorite clip" : "Add favorite"}</title>
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
          {canDelete && (
            <button
              type="button"
              onClick={handleRotate}
              disabled={deleting || rotating}
              className="p-2 rounded-lg text-gray-300 hover:text-white hover:bg-white/10 disabled:opacity-40 transition-colors"
              title="Rotate clip 90°"
              aria-label="Rotate clip 90 degrees"
            >
              {rotating ? (
                <span className="inline-block w-5 h-5 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" aria-hidden />
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <title>Rotate clip</title>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 3h6v6M9 21H6a3 3 0 01-3-3V6m18 3a9 9 0 11-9 9"
                  />
                </svg>
              )}
            </button>
          )}
          {canDelete && (
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
          )}
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
        {mediaError ? (
          <div className="flex h-full w-full max-w-4xl items-center justify-center rounded-2xl border border-white/10 bg-[radial-gradient(circle_at_top,_rgba(187,247,208,0.14),_transparent_35%),linear-gradient(135deg,_rgba(17,24,39,0.96),_rgba(3,7,18,0.98))] p-8 text-center">
            <div>
              <div className="text-4xl">🦎</div>
              <p className="mt-4 text-lg font-semibold text-white">Clip unavailable</p>
              <p className="mt-2 text-sm text-gray-400">
                This event record exists, but the media file could not be loaded.
              </p>
            </div>
          </div>
        ) : (
          <video
            ref={videoRef}
            src={event.clipUrl}
            poster={event.thumbnailUrl}
            className="max-w-full max-h-full object-contain transition-transform duration-300"
            style={rotationStyle(rotation)}
            controls
            autoPlay
            playsInline
            onError={() => setMediaError(true)}
          >
            <track kind="captions" />
          </video>
        )}
      </div>
    </section>
  );
}
