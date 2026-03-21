"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { X, Maximize2, Minimize2, Eye, Move, RotateCcw, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DocumentPreviewProps {
  title: string;
  body: string;
  type: string;
  slug: string;
  isOpen: boolean;
  onClose: () => void;
}

type Size = "pip" | "large" | "fullscreen";

const SIZES: Record<Size, { width: number; height: number } | "fullscreen"> = {
  pip: { width: 480, height: 360 },
  large: { width: 1024, height: 700 },
  fullscreen: "fullscreen",
};

export function DocumentPreview({
  title,
  body,
  type,
  slug,
  isOpen,
  onClose,
}: DocumentPreviewProps) {
  const [size, setSize] = useState<Size>("pip");
  const [position, setPosition] = useState({ x: 20, y: 20 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const initialLoadRef = useRef(false);

  // Store preview data (creates new ID only on first call)
  const storePreviewData = useCallback(async (createNew: boolean = false) => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          body,
          type,
          slug,
          // Include existing ID to update instead of create new
          ...(previewId && !createNew ? { id: previewId } : {})
        }),
      });
      const { id } = await response.json();

      if (!previewId || createNew) {
        setPreviewId(id);
        setIsReady(false);
      } else {
        // Same ID, just tell iframe to refresh
        if (iframeRef.current?.contentWindow && isReady) {
          iframeRef.current.contentWindow.postMessage(
            { type: "preview-refresh" },
            "*"
          );
        }
      }
    } catch (error) {
      console.error("Failed to update preview:", error);
    } finally {
      setIsLoading(false);
    }
  }, [title, body, type, slug, previewId, isReady]);

  // Listen for ready message from iframe
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === "preview-ready") {
        setIsReady(true);
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  // Initial load - create preview ID
  useEffect(() => {
    if (isOpen && !previewId && !initialLoadRef.current) {
      initialLoadRef.current = true;
      storePreviewData(true);
    }
  }, [isOpen, previewId, storePreviewData]);

  // Reset when preview closes
  useEffect(() => {
    if (!isOpen) {
      initialLoadRef.current = false;
      setPreviewId(null);
      setIsReady(false);
    }
  }, [isOpen]);

  // Debounced preview update (for content changes)
  useEffect(() => {
    if (!isOpen || !previewId) return;

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      storePreviewData(false);
    }, 600);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [isOpen, previewId, title, body, type, slug, storePreviewData]);

  // Handle dragging
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (size === "fullscreen") return;
    setIsDragging(true);
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) {
      setDragOffset({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    }
  }, [size]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newX = e.clientX - dragOffset.x;
      const newY = e.clientY - dragOffset.y;

      const maxX = window.innerWidth - (containerRef.current?.offsetWidth || 0);
      const maxY = window.innerHeight - (containerRef.current?.offsetHeight || 0);

      setPosition({
        x: Math.max(0, Math.min(newX, maxX)),
        y: Math.max(0, Math.min(newY, maxY)),
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, dragOffset]);

  const cycleSize = () => {
    if (size === "pip") setSize("large");
    else if (size === "large") setSize("fullscreen");
    else setSize("pip");
  };

  const resetPosition = () => {
    setPosition({ x: 20, y: 20 });
    setSize("pip");
  };

  const handleRefresh = () => {
    storePreviewData(false);
  };

  if (!isOpen) return null;

  const isFullscreen = size === "fullscreen";
  const currentSize = SIZES[size];
  const dimensions = currentSize === "fullscreen"
    ? { width: "100vw", height: "100vh" }
    : { width: `${currentSize.width}px`, height: `${currentSize.height}px` };

  return (
    <div
      ref={containerRef}
      className={`fixed z-50 bg-white dark:bg-zinc-900 rounded-lg shadow-2xl border border-zinc-200 dark:border-zinc-700 overflow-hidden flex flex-col transition-all duration-200 ${
        isDragging ? "cursor-grabbing" : ""
      } ${isFullscreen ? "inset-0 rounded-none" : ""}`}
      style={
        isFullscreen
          ? {}
          : {
              right: `${position.x}px`,
              bottom: `${position.y}px`,
              width: dimensions.width,
              height: dimensions.height,
            }
      }
    >
      {/* Header */}
      <div
        className={`flex items-center justify-between px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border-b border-zinc-200 dark:border-zinc-700 select-none ${
          !isFullscreen ? "cursor-grab" : ""
        } ${isDragging ? "cursor-grabbing" : ""}`}
        onMouseDown={!isFullscreen ? handleMouseDown : undefined}
      >
        <div className="flex items-center gap-2">
          <Eye className="h-4 w-4 text-zinc-500" />
          <span className="text-sm font-medium truncate max-w-[200px]">
            {title || "Preview"}
          </span>
          {type && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-400">
              {type}
            </span>
          )}
          {isLoading && (
            <RefreshCw className="h-3.5 w-3.5 text-zinc-400 animate-spin" />
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={handleRefresh}
            disabled={isLoading}
            title="Refresh preview"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
          </Button>
          {!isFullscreen && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={resetPosition}
              title="Reset position"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={cycleSize}
            title={size === "pip" ? "Enlarge" : size === "large" ? "Fullscreen" : "Picture-in-picture"}
          >
            {size === "fullscreen" ? (
              <Minimize2 className="h-3.5 w-3.5" />
            ) : (
              <Maximize2 className="h-3.5 w-3.5" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onClose}
            title="Close preview"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Drag hint */}
      {!isFullscreen && (
        <div className="absolute bottom-1 left-1/2 -translate-x-1/2 flex items-center gap-1 text-xs text-zinc-400 pointer-events-none z-10">
          <Move className="h-3 w-3" />
          <span>Drag header to move</span>
        </div>
      )}

      {/* Iframe */}
      <div className="flex-1 overflow-hidden bg-zinc-100 dark:bg-zinc-800 relative">
        {previewId ? (
          <iframe
            ref={iframeRef}
            src={`/preview?id=${previewId}`}
            className="w-full h-full border-0 bg-white dark:bg-black"
            title="Document Preview"
          />
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <RefreshCw className="h-8 w-8 text-zinc-400 animate-spin mx-auto mb-2" />
              <p className="text-sm text-zinc-500">Loading preview...</p>
            </div>
          </div>
        )}
      </div>

      {/* Size indicator */}
      <div className="absolute bottom-2 right-2 text-xs text-zinc-400 bg-white/80 dark:bg-zinc-900/80 px-2 py-1 rounded pointer-events-none z-10">
        {size === "pip" && "Small"}
        {size === "large" && "Large"}
        {size === "fullscreen" && "Fullscreen"}
      </div>
    </div>
  );
}

// Preview toggle button component
export function PreviewToggleButton({
  onClick,
  isActive,
}: {
  onClick: () => void;
  isActive: boolean;
}) {
  return (
    <Button
      type="button"
      variant={isActive ? "default" : "outline"}
      size="sm"
      onClick={onClick}
      className="gap-2"
    >
      <Eye className="h-4 w-4" />
      {isActive ? "Hide Preview" : "Live Preview"}
    </Button>
  );
}
