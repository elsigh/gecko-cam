"use client";

import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";

interface LiveStreamProps {
  streamUrl: string;
}

export default function LiveStream({ streamUrl }: LiveStreamProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [status, setStatus] = useState<"loading" | "live" | "error">("loading");
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [rotation, setRotation] = useState<0 | 90 | 180 | 270>(0);

  // Load persisted rotation on mount
  useEffect(() => {
    const saved = parseInt(localStorage.getItem("stream-rotation") ?? "0");
    if (saved === 90 || saved === 180 || saved === 270) setRotation(saved);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    function initHls() {
      if (!video) return;

      if (hlsRef.current) {
        hlsRef.current.destroy();
      }

      if (Hls.isSupported()) {
        const hls = new Hls({
          lowLatencyMode: true,
          backBufferLength: 30,
        });

        hlsRef.current = hls;
        hls.loadSource(streamUrl);
        hls.attachMedia(video);

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          setStatus("live");
          video.play().catch(() => {
            // Autoplay may be blocked — user must interact
          });
        });

        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (data.fatal) {
            setStatus("error");
            // Auto-retry after 5 seconds (Pi may be restarting)
            retryTimeoutRef.current = setTimeout(() => {
              setStatus("loading");
              initHls();
            }, 5000);
          }
        });
      } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
        // Safari native HLS
        video.src = streamUrl;
        video.addEventListener("loadedmetadata", () => {
          setStatus("live");
          video.play().catch(() => {});
        });
        video.addEventListener("error", () => {
          setStatus("error");
          retryTimeoutRef.current = setTimeout(() => {
            setStatus("loading");
            video.load();
          }, 5000);
        });
      } else {
        setStatus("error");
      }
    }

    initHls();

    return () => {
      if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
      hlsRef.current?.destroy();
    };
  }, [streamUrl]);

  function handleRotate() {
    setRotation((r) => {
      const next = ((r + 90) % 360) as 0 | 90 | 180 | 270;
      localStorage.setItem("stream-rotation", String(next));
      return next;
    });
  }

  function handleFullscreen() {
    const video = videoRef.current;
    if (!video) return;
    if (video.requestFullscreen) {
      video.requestFullscreen();
    } else if ("webkitRequestFullscreen" in video) {
      (video as HTMLVideoElement & { webkitRequestFullscreen(): void }).webkitRequestFullscreen();
    } else if ("webkitEnterFullscreen" in video) {
      // iOS Safari
      (video as HTMLVideoElement & { webkitEnterFullscreen(): void }).webkitEnterFullscreen();
    }
  }

  return (
    <div className="relative w-full bg-black rounded-lg overflow-hidden aspect-video">
      <video
        ref={videoRef}
        className="w-full h-full object-contain transition-transform duration-300"
        style={{
          transform: rotation === 0 ? undefined
            : rotation === 180 ? "rotate(180deg)"
            : `rotate(${rotation}deg) scale(${9 / 16})`,
        }}
        muted
        playsInline
        autoPlay
      />
      {status === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60">
          <div className="text-white text-sm flex items-center gap-2">
            <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            Connecting to stream…
          </div>
        </div>
      )}
      {status === "error" && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60">
          <div className="text-center text-white">
            <p className="text-sm font-medium">Stream offline</p>
            <p className="text-xs text-gray-400 mt-1">Retrying in 5 seconds…</p>
          </div>
        </div>
      )}
      <div className="absolute bottom-2 right-2 flex gap-1.5">
        <button
          onClick={handleRotate}
          title="Rotate 90°"
          className="p-1.5 rounded bg-black/50 hover:bg-black/80 text-white transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M15 3h6v6M9 21H6a3 3 0 01-3-3V6m18 3a9 9 0 11-9 9" />
          </svg>
        </button>
        {status === "live" && (
          <button
            onClick={handleFullscreen}
            title="Fullscreen"
            className="p-1.5 rounded bg-black/50 hover:bg-black/80 text-white transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
