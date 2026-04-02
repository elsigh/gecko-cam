import type { CSSProperties } from "react";
import type { Rotation } from "@/lib/types";

export function rotationTransform(rotation: Rotation): string | undefined {
  if (rotation === 0) return undefined;
  if (rotation === 180) return "rotate(180deg)";
  return `rotate(${rotation}deg) scale(${9 / 16})`;
}

export function rotationStyle(rotation: Rotation): CSSProperties | undefined {
  const transform = rotationTransform(rotation);
  return transform ? { transform } : undefined;
}
