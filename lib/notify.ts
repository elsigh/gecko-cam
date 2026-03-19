import type { GeckoEvent } from "./types";

function formatDate(timestamp: number): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(timestamp));
}

function getAppUrl(): string {
  const url = process.env.NEXT_PUBLIC_APP_URL ?? process.env.VERCEL_URL;
  if (!url) return "https://gecko-cam.vercel.app";
  return url.startsWith("http") ? url : `https://${url}`;
}

export async function notifyGeckoEvent(event: GeckoEvent): Promise<void> {
  const token = process.env.SLACK_BOT_TOKEN;
  const channelId = process.env.SLACK_NOTIFY_CHANNEL_ID;
  if (!token || !channelId) return;

  const date = formatDate(event.timestamp);
  const score = event.motionScore ? ` · score ${Math.round(event.motionScore)}` : "";
  const eventUrl = `${getAppUrl()}/events/${event.id}`;
  const text = `🦎 *MauMau spotted!* ${date}${score}\n${eventUrl}`;

  const res = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ channel: channelId, text }),
  });

  const data = await res.json() as { ok: boolean; error?: string };
  if (!data.ok) {
    console.error("Slack notification failed:", data.error);
  }
}
