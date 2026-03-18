"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { GeckoEvent } from "@/lib/types";

interface EventVideoModalProps {
  event: GeckoEvent;
  onClose: () => void;
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

export default function EventVideoModal({ event, onClose }: EventVideoModalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const close = useCallback(() => {
    videoRef.current?.pause();
    onClose();
  }, [onClose]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (isFullscreen && document.fullscreenElement) {
          document.exitFullscreen();
        } else {
          close();
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [close, isFullscreen]);

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

  const modal = (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black"
      role="dialog"
      aria-modal="true"
      aria-label={`Watch event from ${formatDate(event.timestamp)}`}
    >
      {/* Top bar: close + fullscreen */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between p-3 bg-gradient-to-b from-black/80 to-transparent">
        <p className="text-sm text-white/90 truncate">
          {formatDate(event.timestamp)}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleFullscreen}
            className="p-2 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors"
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
          <button
            type="button"
            onClick={close}
            className="p-2 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors"
            title="Close"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <title>Close</title>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Video container - fills viewport; click backdrop to close */}
      <div
        ref={containerRef}
        className="flex-1 flex items-center justify-center min-h-0 p-4 pt-14 relative"
      >
        <button
          type="button"
          className="absolute inset-0 w-full h-full cursor-default"
          onClick={close}
          aria-label="Close overlay"
        />
        <video
          ref={videoRef}
          src={event.clipUrl}
          className="max-w-full max-h-full object-contain relative z-10"
          controls
          autoPlay
          playsInline
          onClick={(e) => e.stopPropagation()}
        >
          <track kind="captions" />
        </video>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(modal, document.body);
}
