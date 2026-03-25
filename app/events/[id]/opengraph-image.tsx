import { ImageResponse } from "next/og";
import { getCachedEvent } from "@/lib/events-cache";
import { formatEventTimestamp } from "@/lib/event-time";

export const alt = "Gecko Cam motion event";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OgImage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const event = await getCachedEvent(id);

  const date = event ? formatEventTimestamp(event.timestamp) : null;
  const duration = event?.duration ? `${Math.round(event.duration)}s clip` : "Motion event";
  const score = event?.motionScore ? `score ${Math.round(event.motionScore)}` : null;

  return new ImageResponse(
    (
      <div
        style={{
          width: 1200,
          height: 630,
          display: "flex",
          position: "relative",
          overflow: "hidden",
          background: "linear-gradient(135deg, #091111 0%, #13291d 55%, #2a2110 100%)",
          fontFamily: "sans-serif",
        }}
      >
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
              filter: "blur(24px) saturate(1.15)",
              transform: "scale(1.08)",
              opacity: 0.65,
            }}
          />
        )}

        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(135deg, rgba(5,8,12,0.78) 0%, rgba(5,8,12,0.38) 35%, rgba(5,8,12,0.55) 100%)",
            display: "flex",
          }}
        />

        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            padding: 44,
            gap: 36,
          }}
        >
          <div
            style={{
              width: 660,
              height: 542,
              display: "flex",
              position: "relative",
              overflow: "hidden",
              borderRadius: 28,
              border: "1px solid rgba(255,255,255,0.16)",
              boxShadow: "0 22px 70px rgba(0,0,0,0.45)",
              background: "rgba(255,255,255,0.08)",
            }}
          >
            {event && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={event.thumbnailUrl}
                alt=""
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                }}
              />
            )}
            <div
              style={{
                position: "absolute",
                inset: 0,
                background:
                  "linear-gradient(to top, rgba(0,0,0,0.32) 0%, rgba(0,0,0,0.04) 42%, rgba(0,0,0,0.18) 100%)",
              }}
            />
            <div
              style={{
                position: "absolute",
                top: 22,
                left: 22,
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 16px",
                borderRadius: 999,
                background: "rgba(10, 16, 14, 0.58)",
                border: "1px solid rgba(255,255,255,0.14)",
                color: "#f6f7e9",
                fontSize: 20,
                fontWeight: 700,
              }}
            >
              <span>🦎</span>
              <span>Motion Event</span>
            </div>
          </div>

          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              paddingTop: 8,
              paddingBottom: 8,
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  color: "#f1f5ed",
                }}
              >
                <span style={{ fontSize: 38 }}>🦎</span>
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <span style={{ fontSize: 34, fontWeight: 800, letterSpacing: -0.8 }}>
                    Gecko Cam
                  </span>
                  <span style={{ fontSize: 22, opacity: 0.8 }}>
                    MauMau motion capture
                  </span>
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                  color: "#f9fcf6",
                }}
              >
                <span style={{ fontSize: 56, fontWeight: 800, lineHeight: 1.02, letterSpacing: -1.4 }}>
                  {date ?? "Motion event"}
                </span>
                <span style={{ fontSize: 24, opacity: 0.82 }}>
                  Captured in the vivarium
                </span>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <div
                  style={{
                    display: "flex",
                    padding: "12px 18px",
                    borderRadius: 999,
                    background: "rgba(236, 250, 188, 0.14)",
                    border: "1px solid rgba(236, 250, 188, 0.25)",
                    color: "#f4f8d4",
                    fontSize: 22,
                    fontWeight: 700,
                  }}
                >
                  {duration}
                </div>
                {score ? (
                  <div
                    style={{
                      display: "flex",
                      padding: "12px 18px",
                      borderRadius: 999,
                      background: "rgba(255,255,255,0.08)",
                      border: "1px solid rgba(255,255,255,0.14)",
                      color: "#f7f9f4",
                      fontSize: 22,
                      fontWeight: 700,
                    }}
                  >
                    {score}
                  </div>
                ) : null}
              </div>

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  color: "rgba(247,249,244,0.8)",
                  fontSize: 22,
                }}
              >
                <span>Watch clip and review the event timeline</span>
                <span style={{ color: "#d8f36a", fontWeight: 700 }}>
                  gecko-cam.vercel.app
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
