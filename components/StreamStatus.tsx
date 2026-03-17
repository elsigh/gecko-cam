"use client";

import { useEffect, useState } from "react";

interface StreamStatusProps {
  streamUrl: string;
}

export default function StreamStatus({ streamUrl }: StreamStatusProps) {
  const [isLive, setIsLive] = useState<boolean | null>(null);

  useEffect(() => {
    async function checkStream() {
      try {
        const res = await fetch(streamUrl, { method: "HEAD", cache: "no-store" });
        setIsLive(res.ok);
      } catch {
        setIsLive(false);
      }
    }

    checkStream();
    const interval = setInterval(checkStream, 15000);
    return () => clearInterval(interval);
  }, [streamUrl]);

  if (isLive === null) return null;

  return (
    <div className="flex items-center gap-1.5 text-xs font-medium">
      <span
        className={`w-2 h-2 rounded-full ${
          isLive
            ? "bg-green-400 shadow-[0_0_6px_2px_rgba(74,222,128,0.6)]"
            : "bg-gray-500"
        }`}
      />
      <span className={isLive ? "text-green-400" : "text-gray-500"}>
        {isLive ? "LIVE" : "OFFLINE"}
      </span>
    </div>
  );
}
