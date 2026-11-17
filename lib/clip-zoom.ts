import type { Rotation } from "@/lib/types";

export const MIN_CLIP_ZOOM = 1;
export const MAX_CLIP_ZOOM = 5;

export type Size = {
  width: number;
  height: number;
};

export type Point = {
  x: number;
  y: number;
};

export type ClipTransform = {
  zoom: number;
  x: number;
  y: number;
};

export const IDENTITY_TRANSFORM: ClipTransform = { zoom: 1, x: 0, y: 0 };

export type MediaOrientationStyle = {
  position?: "absolute";
  left?: string;
  top?: string;
  width: number | string;
  height: number | string;
  transform?: string;
  transformOrigin?: string;
  maxWidth?: string;
};

function clamp(value: number, min: number, max: number): number {
  const next = Math.min(max, Math.max(min, value));
  return Object.is(next, -0) ? 0 : next;
}

export function displayedAspect(intrinsicAspect: number, rotation: Rotation): number {
  if (!Number.isFinite(intrinsicAspect) || intrinsicAspect <= 0) return 16 / 9;
  if (rotation === 90 || rotation === 270) return 1 / intrinsicAspect;
  return intrinsicAspect;
}

export function fitContain(viewport: Size, aspect: number): Size {
  if (viewport.width <= 0 || viewport.height <= 0 || aspect <= 0) {
    return { width: 0, height: 0 };
  }

  const viewportAspect = viewport.width / viewport.height;
  if (viewportAspect > aspect) {
    const height = viewport.height;
    return { width: height * aspect, height };
  }

  const width = viewport.width;
  return { width, height: width / aspect };
}

export function panLimits(zoom: number, frame: Size, viewport: Size): { maxX: number; maxY: number } {
  return {
    maxX: Math.max(0, (frame.width * zoom - viewport.width) / 2),
    maxY: Math.max(0, (frame.height * zoom - viewport.height) / 2),
  };
}

export function clampClipTransform(
  transform: ClipTransform,
  viewport: Size,
  frame: Size,
): ClipTransform {
  const zoom = clamp(transform.zoom, MIN_CLIP_ZOOM, MAX_CLIP_ZOOM);
  const limits = panLimits(zoom, frame, viewport);
  return {
    zoom,
    x: clamp(transform.x, -limits.maxX, limits.maxX),
    y: clamp(transform.y, -limits.maxY, limits.maxY),
  };
}

// Screen-space zoom. `translate` is applied after `scale` and is not rotated,
// so dragging right always moves the picture right.
export function zoomAtPointWithinFrame(
  current: ClipTransform,
  viewport: Size,
  frame: Size,
  focal: Point,
  nextZoom: number,
): ClipTransform {
  const zoom = clamp(nextZoom, MIN_CLIP_ZOOM, MAX_CLIP_ZOOM);
  const centerX = viewport.width / 2;
  const centerY = viewport.height / 2;
  const safeZoom = current.zoom || 1;
  const localX = (focal.x - centerX - current.x) / safeZoom;
  const localY = (focal.y - centerY - current.y) / safeZoom;

  return clampClipTransform(
    {
      zoom,
      x: focal.x - centerX - localX * zoom,
      y: focal.y - centerY - localY * zoom,
    },
    viewport,
    frame,
  );
}

export function panBy(
  current: ClipTransform,
  dx: number,
  dy: number,
  viewport: Size,
  frame: Size,
): ClipTransform {
  return clampClipTransform(
    { zoom: current.zoom, x: current.x + dx, y: current.y + dy },
    viewport,
    frame,
  );
}

export function wheelZoomFactor(deltaY: number, deltaMode: number): number {
  const line = deltaMode === 1 ? deltaY * 16 : deltaY;
  const pixels = deltaMode === 2 ? deltaY * 800 : line;
  return Math.exp(-pixels * 0.0016);
}

export function stageTransform(transform: ClipTransform): string {
  const x = Number.isFinite(transform.x) ? transform.x : 0;
  const y = Number.isFinite(transform.y) ? transform.y : 0;
  const zoom = Number.isFinite(transform.zoom) ? transform.zoom : 1;
  return `translate(${x}px, ${y}px) scale(${zoom})`;
}

// Orientation is a separate, constant transform from pan/zoom. 90° and 270°
// swap the media box instead of shrinking it with scale(9/16), which used to
// multiply every zoom step and send pans along the pre-rotation axes.
export function mediaOrientationStyle(rotation: Rotation, frame: Size): MediaOrientationStyle {
  if (rotation === 90 || rotation === 270) {
    return {
      position: "absolute",
      left: "50%",
      top: "50%",
      width: frame.height,
      height: frame.width,
      transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
      transformOrigin: "center",
      maxWidth: "none",
    };
  }

  if (rotation === 180) {
    return {
      width: "100%",
      height: "100%",
      transform: "rotate(180deg)",
      transformOrigin: "center",
    };
  }

  return {
    width: "100%",
    height: "100%",
  };
}
