import { ImageResponse } from "next/og";
import { getEvent } from "@/lib/kv";

export const runtime = "edge";
export const alt = "Gecko Cam motion event";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OgImage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const event = await getEvent(id);

  const date = event
    ? new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      }).format(new Date(event.timestamp))
    : null;

  return new ImageResponse(
    (
      <div
        style={{
          width: 1200,
          height: 630,
          display: "flex",
          position: "relative",
          background: "#000",
          fontFamily: "sans-serif",
        }}
      >
        {/* Thumbnail background */}
        {event && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={event.thumbnailUrl}
            alt=""
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
          />
        )}

        {/* Gradient overlays */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(to bottom, rgba(0,0,0,0.45) 0%, transparent 35%, transparent 55%, rgba(0,0,0,0.85) 100%)",
            display: "flex",
          }}
        />

        {/* Top-left: branding */}
        <div
          style={{
            position: "absolute",
            top: 32,
            left: 40,
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <span style={{ fontSize: 36 }}>🦎</span>
          <span
            style={{
              color: "#fff",
              fontSize: 28,
              fontWeight: 700,
              letterSpacing: "-0.5px",
              textShadow: "0 1px 4px rgba(0,0,0,0.6)",
            }}
          >
            Gecko Cam
          </span>
        </div>

        {/* Center: play button */}
        {event && (
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              width: 80,
              height: 80,
              borderRadius: "50%",
              background: "rgba(255,255,255,0.2)",
              border: "2px solid rgba(255,255,255,0.5)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {/* triangle */}
            <div
              style={{
                width: 0,
                height: 0,
                borderTop: "14px solid transparent",
                borderBottom: "14px solid transparent",
                borderLeft: "24px solid rgba(255,255,255,0.9)",
                marginLeft: 6,
              }}
            />
          </div>
        )}

        {/* Bottom: date + score */}
        <div
          style={{
            position: "absolute",
            bottom: 36,
            left: 40,
            right: 40,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
          }}
        >
          <span
            style={{
              color: "#fff",
              fontSize: 32,
              fontWeight: 600,
              textShadow: "0 1px 6px rgba(0,0,0,0.8)",
            }}
          >
            {date ?? "Motion event"}
          </span>
          {event?.motionScore ? (
            <span
              style={{
                color: "rgba(255,255,255,0.7)",
                fontSize: 20,
                textShadow: "0 1px 4px rgba(0,0,0,0.8)",
              }}
            >
              score {Math.round(event.motionScore)}
            </span>
          ) : null}
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
