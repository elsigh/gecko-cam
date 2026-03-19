"use client";

import { useEffect, useState } from "react";

type Rotation = 0 | 90 | 180 | 270;

export function useStreamRotation(): Rotation {
  const [rotation, setRotation] = useState<Rotation>(0);
  useEffect(() => {
    const saved = parseInt(localStorage.getItem("stream-rotation") ?? "0");
    if (saved === 90 || saved === 180 || saved === 270) setRotation(saved as Rotation);
  }, []);
  return rotation;
}

export function rotationStyle(rotation: Rotation): React.CSSProperties | undefined {
  if (rotation === 0) return undefined;
  if (rotation === 180) return { transform: "rotate(180deg)" };
  return { transform: `rotate(${rotation}deg) scale(${9 / 16})` };
}
