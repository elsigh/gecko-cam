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

  return (
    <div className="relative w-full bg-black rounded-lg overflow-hidden aspect-video">
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
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
    </div>
  );
}
