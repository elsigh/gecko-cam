import type { GeckoEvent } from "./types";

function getAppUrl(): string {
  const url =
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.VERCEL_PROJECT_PRODUCTION_URL ??
    process.env.VERCEL_URL;
  if (!url) return "https://gecko-cam.vercel.app";
  return url.startsWith("http") ? url : `https://${url}`;
}

function formatDuration(seconds: number): string {
  const rounded = Math.round(seconds);
  if (rounded <= 0) return "";
  if (rounded < 60) return `${rounded}s`;
  return `${Math.floor(rounded / 60)}m ${rounded % 60}s`;
}

export async function notifyGeckoEvent(event: GeckoEvent): Promise<void> {
  const token = process.env.SLACK_BOT_TOKEN;
  const channelId = process.env.SLACK_NOTIFY_CHANNEL_ID;
  if (!token || !channelId) return;

  const score = event.motionScore ? ` · score ${Math.round(event.motionScore)}` : "";
  const eventUrl = `${getAppUrl()}/events/${event.id}`;
  const duration = formatDuration(event.duration);
  const detailBits = [duration, score.replace(/^ · /, "")].filter(Boolean);
  const text = `🦎 MauMau spotted!${score} ${eventUrl}`.trim();

  const res = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      channel: channelId,
      text,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: [
              `*🦎 MauMau spotted!*${score}`,
              detailBits.length > 0 ? detailBits.join(" · ") : null,
              `<${eventUrl}|Open event page>`,
            ]
              .filter(Boolean)
              .join("\n"),
          },
          accessory: {
            type: "image",
            image_url: event.thumbnailUrl,
            alt_text: "Motion event thumbnail",
          },
        },
        {
          type: "actions",
          elements: [
            {
              type: "button",
              text: {
                type: "plain_text",
                text: "Open Event",
                emoji: true,
              },
              url: eventUrl,
              style: "primary",
            },
            {
              type: "button",
              text: {
                type: "plain_text",
                text: "Play Clip",
                emoji: true,
              },
              url: event.clipUrl,
            },
          ],
        },
      ],
    }),
  });

  const data = await res.json() as { ok: boolean; error?: string };
  if (!data.ok) {
    console.error("Slack notification failed:", data.error);
  }
}
