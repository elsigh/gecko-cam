"use client";

import { useEffect, useState } from "react";
import {
  LEGACY_STREAM_ROTATION_STORAGE_KEY,
  STREAM_ROTATION_STORAGE_KEY,
} from "@/lib/rotation";
import type { Rotation } from "@/lib/types";

export function useStreamRotation(): Rotation {
  const [rotation, setRotation] = useState<Rotation>(0);
  useEffect(() => {
    localStorage.removeItem(LEGACY_STREAM_ROTATION_STORAGE_KEY);
    localStorage.removeItem("stream-rotation-v2");
    const saved = parseInt(localStorage.getItem(STREAM_ROTATION_STORAGE_KEY) ?? "0");
    if (saved === 90 || saved === 180 || saved === 270) setRotation(saved as Rotation);
  }, []);
  return rotation;
}
