import type { GeckoEvent } from "./types";
import { getAppUrl } from "./site-url";

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
  const text = [
    `🦎 MauMau spotted!${score}`,
    detailBits.length > 0 ? detailBits.join(" · ") : null,
    eventUrl,
  ]
    .filter(Boolean)
    .join("\n");

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
        },
      ],
    }),
  });

  const data = await res.json() as { ok: boolean; error?: string };
  if (!data.ok) {
    console.error("Slack notification failed:", data.error);
  }
}
