"use client";

import { useEffect, useState } from "react";
import type { Rotation } from "@/lib/types";

export function useStreamRotation(): Rotation {
  const [rotation, setRotation] = useState<Rotation>(0);
  useEffect(() => {
    const saved = parseInt(localStorage.getItem("stream-rotation") ?? "0");
    if (saved === 90 || saved === 180 || saved === 270) setRotation(saved as Rotation);
  }, []);
  return rotation;
}
