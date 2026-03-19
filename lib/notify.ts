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
  if (
    !process.env.SLACK_BOT_TOKEN ||
    !process.env.SLACK_SIGNING_SECRET ||
    !process.env.SLACK_NOTIFY_CHANNEL_ID
  ) {
    return;
  }

  const date = formatDate(event.timestamp);
  const score = event.motionScore ? ` · score ${Math.round(event.motionScore)}` : "";
  const eventUrl = `${getAppUrl()}/events/${event.id}`;

  try {
    const { getBot } = await import("./bot");
    const channel = getBot().channel(process.env.SLACK_NOTIFY_CHANNEL_ID);
    await channel.post(`🦎 *MauMau spotted!* ${date}${score}\n${eventUrl}`);
  } catch (err) {
    // Notifications are best-effort — never let this break event saving
    const msg = err instanceof Error ? `${err.message}\n${err.stack}` : String(err);
    console.error("Slack notification failed:", msg);
  }
}
