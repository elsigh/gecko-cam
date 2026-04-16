"use client";

import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";

interface LiveStreamProps {
  streamUrl: string;
}

const CONNECT_TIMEOUT_MS = 15000; // give up and retry if no response in 15s
const RETRY_DELAY_MS = 5000;

export default function LiveStream({ streamUrl }: LiveStreamProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [status, setStatus] = useState<"loading" | "live" | "error">("loading");
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [clock, setClock] = useState("");

  useEffect(() => {
    localStorage.removeItem("stream-rotation");
    localStorage.removeItem("stream-rotation-v2");
    localStorage.removeItem("stream-rotation-v3");
  }, []);

  // Ticking clock
  useEffect(() => {
    function tick() {
      setClock(new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }));
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    function clearTimers() {
      if (retryTimeoutRef.current) { clearTimeout(retryTimeoutRef.current); retryTimeoutRef.current = null; }
      if (connectTimeoutRef.current) { clearTimeout(connectTimeoutRef.current); connectTimeoutRef.current = null; }
    }

    function scheduleRetry() {
      clearTimers();
      retryTimeoutRef.current = setTimeout(() => {
        setStatus("loading");
        initHls();
      }, RETRY_DELAY_MS);
    }

    function startConnectTimeout() {
      clearTimeout(connectTimeoutRef.current ?? undefined);
      connectTimeoutRef.current = setTimeout(() => {
        // Stream hung without erroring — force a retry
        setStatus("error");
        scheduleRetry();
      }, CONNECT_TIMEOUT_MS);
    }

    function initHls() {
      if (!video) return;

      hlsRef.current?.destroy();
      startConnectTimeout();

      if (Hls.isSupported()) {
        const hls = new Hls({ lowLatencyMode: true, backBufferLength: 30 });
        hlsRef.current = hls;
        hls.loadSource(streamUrl);
        hls.attachMedia(video);

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          clearTimeout(connectTimeoutRef.current ?? undefined);
          connectTimeoutRef.current = null;
          setStatus("live");
          video.play().catch(() => {});
        });

        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (data.fatal) {
            setStatus("error");
            scheduleRetry();
          }
        });
      } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
        // Safari native HLS — no built-in hang detection, rely on connectTimeoutRef
        video.src = streamUrl;
        video.load();

        const onLoaded = () => {
          clearTimeout(connectTimeoutRef.current ?? undefined);
          connectTimeoutRef.current = null;
          setStatus("live");
          video.play().catch(() => {});
        };
        const onError = () => {
          setStatus("error");
          scheduleRetry();
        };

        video.addEventListener("loadedmetadata", onLoaded, { once: true });
        video.addEventListener("error", onError, { once: true });
      } else {
        setStatus("error");
      }
    }

    initHls();

    return () => {
      clearTimers();
      hlsRef.current?.destroy();
    };
  }, [streamUrl]);

  function handleRetry() {
    if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
    if (connectTimeoutRef.current) clearTimeout(connectTimeoutRef.current);
    setStatus("loading");
    const video = videoRef.current;
    if (!video) return;
    // Re-trigger the effect by temporarily clearing src
    if (Hls.isSupported()) {
      hlsRef.current?.destroy();
      const hls = new Hls({ lowLatencyMode: true, backBufferLength: 30 });
      hlsRef.current = hls;
      hls.loadSource(streamUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => { setStatus("live"); video.play().catch(() => {}); });
      hls.on(Hls.Events.ERROR, (_e, data) => { if (data.fatal) { setStatus("error"); } });
    } else {
      video.src = "";
      video.load();
      setTimeout(() => { video.src = streamUrl; video.load(); }, 100);
    }
  }

  function handleFullscreen() {
    const container = containerRef.current;
    const video = videoRef.current;
    if (container?.requestFullscreen) {
      void container.requestFullscreen();
    } else if (container && "webkitRequestFullscreen" in container) {
      (container as HTMLDivElement & { webkitRequestFullscreen(): void }).webkitRequestFullscreen();
    } else if (video && "webkitEnterFullscreen" in video) {
      (video as HTMLVideoElement & { webkitEnterFullscreen(): void }).webkitEnterFullscreen();
    }
  }

  return (
    <div
      ref={containerRef}
      className="relative w-full bg-black rounded-lg overflow-hidden aspect-video"
    >
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
            <button
              onClick={handleRetry}
              className="mt-2 text-xs text-blue-300 hover:text-blue-200 underline"
            >
              Retry now
            </button>
          </div>
        </div>
      )}
      {clock && (
        <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-black/50 text-white text-xs font-mono tabular-nums tracking-wide">
          {clock}
        </div>
      )}
      <div className="absolute bottom-2 right-2 flex gap-1.5">
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
