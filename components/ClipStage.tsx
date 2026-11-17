"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type Ref,
} from "react";
import {
  IDENTITY_TRANSFORM,
  displayedAspect,
  fitContain,
  mediaOrientationStyle,
  clampClipTransform,
  panBy,
  stageTransform,
  wheelZoomFactor,
  zoomAtPointWithinFrame,
  type ClipTransform,
  type Point,
  type Size,
} from "@/lib/clip-zoom";
import type { Rotation } from "@/lib/types";

type MediaElement = HTMLVideoElement;

export type ClipMediaBinding = {
  ref: (node: MediaElement | null) => void;
  style: ReturnType<typeof mediaOrientationStyle>;
  className: string;
  draggable: false;
};

interface ClipStageProps {
  rotation: Rotation;
  resetKey?: string;
  mediaRef?: Ref<MediaElement | null>;
  children: (media: ClipMediaBinding) => ReactNode;
}

function assignRef(ref: Ref<MediaElement | null> | undefined, node: MediaElement | null) {
  if (!ref) return;
  if (typeof ref === "function") {
    ref(node);
    return;
  }
  ref.current = node;
}

function clientPoint(viewport: HTMLElement, clientX: number, clientY: number): Point {
  const rect = viewport.getBoundingClientRect();
  return { x: clientX - rect.left, y: clientY - rect.top };
}

export default function ClipStage({
  rotation,
  resetKey,
  mediaRef,
  children,
}: ClipStageProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const mediaNodeRef = useRef<MediaElement | null>(null);
  const passedMediaRef = useRef(mediaRef);
  const [viewport, setViewport] = useState<Size>({ width: 0, height: 0 });
  const [aspect, setAspect] = useState(16 / 9);
  const [transform, setTransform] = useState<ClipTransform>(IDENTITY_TRANSFORM);
  const transformRef = useRef(transform);
  const viewportSizeRef = useRef(viewport);
  const frameRef = useRef<Size>({ width: 0, height: 0 });
  const pointersRef = useRef(new Map<number, Point>());
  const dragRef = useRef<{
    pointerId: number;
    x: number;
    y: number;
    start: ClipTransform;
    moved: boolean;
  } | null>(null);
  const pinchRef = useRef<{
    distance: number;
    start: ClipTransform;
    mid: Point;
  } | null>(null);
  const pendingRef = useRef<ClipTransform | null>(null);
  const rafRef = useRef<number | null>(null);

  passedMediaRef.current = mediaRef;
  transformRef.current = transform;
  viewportSizeRef.current = viewport;

  const frame = fitContain(viewport, displayedAspect(aspect, rotation));
  frameRef.current = frame;

  const commit = useCallback((next: ClipTransform) => {
    const finalTransform = clampClipTransform(
      next,
      viewportSizeRef.current,
      frameRef.current,
    );
    transformRef.current = finalTransform;
    pendingRef.current = finalTransform;
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const next = pendingRef.current;
      if (!next) return;
      setTransform((current) => (
        current.zoom === next.zoom && current.x === next.x && current.y === next.y
          ? current
          : next
      ));
    });
  }, []);

  useEffect(() => {
    const node = viewportRef.current;
    if (!node) return undefined;

    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setViewport({ width, height });
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    commit(IDENTITY_TRANSFORM);
  }, [commit, resetKey]);

  useEffect(() => {
    commit(transformRef.current);
  }, [commit, frame.height, frame.width, viewport.height, viewport.width]);

  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  useEffect(() => {
    const node = viewportRef.current;
    if (!node) return undefined;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const focal = clientPoint(node, event.clientX, event.clientY);
      const current = transformRef.current;
      commit(zoomAtPointWithinFrame(
        current,
        viewportSizeRef.current,
        frameRef.current,
        focal,
        current.zoom * wheelZoomFactor(event.deltaY, event.deltaMode),
      ));
    };

    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, [commit]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.closest("input, textarea, select") || target.isContentEditable)
      ) {
        return;
      }
      if (event.altKey || event.ctrlKey || event.metaKey) return;

      const current = transformRef.current;
      const center = {
        x: viewportSizeRef.current.width / 2,
        y: viewportSizeRef.current.height / 2,
      };

      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        commit(zoomAtPointWithinFrame(
          current,
          viewportSizeRef.current,
          frameRef.current,
          center,
          current.zoom * 1.25,
        ));
      } else if (event.key === "-" || event.key === "_") {
        event.preventDefault();
        commit(zoomAtPointWithinFrame(
          current,
          viewportSizeRef.current,
          frameRef.current,
          center,
          current.zoom / 1.25,
        ));
      } else if (event.key === "0") {
        event.preventDefault();
        commit(IDENTITY_TRANSFORM);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [commit]);

  const setMediaNode = useCallback((node: MediaElement | null) => {
    mediaNodeRef.current = node;
    assignRef(passedMediaRef.current, node);
    if (node && node.videoWidth > 0 && node.videoHeight > 0) {
      setAspect(node.videoWidth / node.videoHeight);
    }
  }, []);

  useEffect(() => {
    const node = mediaNodeRef.current;
    if (!node) return undefined;

    const readAspect = () => {
      if (node.videoWidth > 0 && node.videoHeight > 0) {
        setAspect(node.videoWidth / node.videoHeight);
      }
    };

    readAspect();
    node.addEventListener("loadedmetadata", readAspect);
    node.addEventListener("load", readAspect);
    return () => {
      node.removeEventListener("loadedmetadata", readAspect);
      node.removeEventListener("load", readAspect);
    };
  }, [resetKey]);

  function updatePinch(viewportNode: HTMLDivElement) {
    const points = [...pointersRef.current.values()];
    const pinch = pinchRef.current;
    if (!pinch || points.length < 2) return;
    const [first, second] = points;
    if (!first || !second) return;
    const distance = Math.hypot(first.x - second.x, first.y - second.y);
    if (pinch.distance <= 0 || distance <= 0) return;
    const midClient = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
    const mid = clientPoint(viewportNode, midClient.x, midClient.y);
    const zoomed = zoomAtPointWithinFrame(
      pinch.start,
      viewportSizeRef.current,
      frameRef.current,
      pinch.mid,
      pinch.start.zoom * (distance / pinch.distance),
    );
    commit(panBy(
      zoomed,
      mid.x - pinch.mid.x,
      mid.y - pinch.mid.y,
      viewportSizeRef.current,
      frameRef.current,
    ));
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    const viewportNode = event.currentTarget;
    viewportNode.setPointerCapture(event.pointerId);
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointersRef.current.size >= 2) {
      const points = [...pointersRef.current.values()];
      const [first, second] = points;
      if (!first || !second) return;
      const midClient = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
      pinchRef.current = {
        distance: Math.hypot(first.x - second.x, first.y - second.y),
        start: transformRef.current,
        mid: clientPoint(viewportNode, midClient.x, midClient.y),
      };
      dragRef.current = null;
      return;
    }

    dragRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      start: transformRef.current,
      moved: false,
    };
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!pointersRef.current.has(event.pointerId)) return;
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointersRef.current.size >= 2) {
      updatePinch(event.currentTarget);
      return;
    }

    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (Math.hypot(dx, dy) > 3) drag.moved = true;
    if (!drag.moved) return;
    commit(panBy(drag.start, dx, dy, viewportSizeRef.current, frameRef.current));
  }

  function handlePointerEnd(event: ReactPointerEvent<HTMLDivElement>) {
    pointersRef.current.delete(event.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handleDoubleClick(event: React.MouseEvent<HTMLDivElement>) {
    const target = event.target;
    if (target instanceof HTMLElement && target.closest("button, input, a")) return;
    const viewportNode = viewportRef.current;
    if (!viewportNode) return;
    const focal = clientPoint(viewportNode, event.clientX, event.clientY);
    const current = transformRef.current;
    commit(current.zoom > 1.05
      ? IDENTITY_TRANSFORM
      : zoomAtPointWithinFrame(current, viewport, frame, focal, 2.5));
  }

  function zoomFromCenter(nextZoom: number) {
    commit(zoomAtPointWithinFrame(
      transformRef.current,
      viewport,
      frame,
      { x: viewport.width / 2, y: viewport.height / 2 },
      nextZoom,
    ));
  }

  const mediaStyle = mediaOrientationStyle(rotation, frame);
  const grabbing = transform.zoom > 1;

  return (
    <div className="flex min-h-[60vh] w-full flex-1 flex-col">
      <div
        ref={viewportRef}
        className={`relative min-h-0 w-full flex-1 overflow-hidden bg-black touch-none select-none ${
          grabbing ? "cursor-grab active:cursor-grabbing" : "cursor-zoom-in"
        }`}
        style={{ touchAction: "none" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onDoubleClick={handleDoubleClick}
        aria-label="Clip viewer. Scroll or pinch to zoom, drag to pan."
      >
        <div className="flex h-full w-full items-center justify-center">
          <div
            className="relative overflow-hidden bg-black"
            style={{
              width: frame.width || undefined,
              height: frame.height || undefined,
              transform: stageTransform(transform),
              transformOrigin: "center center",
            }}
          >
            {children({
              ref: setMediaNode,
              style: mediaStyle,
              className: "h-full w-full bg-black object-contain",
              draggable: false,
            })}
          </div>
        </div>

        <div className="pointer-events-none absolute right-2 top-2 flex items-center gap-1">
          <button
            type="button"
            className="pointer-events-auto inline-flex h-11 w-11 items-center justify-center rounded-md border border-white/15 bg-black/70 text-lg text-white hover:bg-black/85"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => zoomFromCenter(transform.zoom / 1.25)}
            aria-label="Zoom out"
            title="Zoom out"
          >
            −
          </button>
          <span className="pointer-events-none min-w-14 rounded-md bg-black/70 px-2 py-2 text-center text-xs tabular-nums text-white">
            {Math.round(transform.zoom * 100)}%
          </span>
          <button
            type="button"
            className="pointer-events-auto inline-flex h-11 w-11 items-center justify-center rounded-md border border-white/15 bg-black/70 text-lg text-white hover:bg-black/85"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => zoomFromCenter(transform.zoom * 1.25)}
            aria-label="Zoom in"
            title="Zoom in"
          >
            +
          </button>
          <button
            type="button"
            className="pointer-events-auto inline-flex h-11 items-center justify-center rounded-md border border-white/15 bg-black/70 px-3 text-xs font-medium text-white hover:bg-black/85 disabled:opacity-40"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => commit(IDENTITY_TRANSFORM)}
            disabled={
              transform.zoom < 1.01
              && Math.abs(transform.x) < 0.5
              && Math.abs(transform.y) < 0.5
            }
            aria-label="Reset zoom"
            title="Reset zoom"
          >
            Fit
          </button>
        </div>
      </div>
    </div>
  );
}
