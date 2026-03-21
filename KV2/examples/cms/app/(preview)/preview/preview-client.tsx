"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function PreviewClient() {
  const router = useRouter();

  useEffect(() => {
    let savedScrollY = 0;

    const handleMessage = (event: MessageEvent) => {
      // Only accept messages from parent window
      if (event.source !== window.parent) return;

      if (event.data?.type === "preview-refresh") {
        // Save scroll position
        savedScrollY = window.scrollY;

        // Use router.refresh() for a soft refresh that preserves more state
        router.refresh();

        // Restore scroll position after refresh completes
        // Using requestAnimationFrame to wait for the DOM to update
        const restoreScroll = () => {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              window.scrollTo(0, savedScrollY);
            });
          });
        };

        // Also try after a short delay as a fallback
        setTimeout(restoreScroll, 100);
        setTimeout(restoreScroll, 300);
      }
    };

    window.addEventListener("message", handleMessage);

    // Notify parent that we're ready
    window.parent.postMessage({ type: "preview-ready" }, "*");

    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, [router]);

  return null;
}
