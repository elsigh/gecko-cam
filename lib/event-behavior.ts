import type {
  GeckoEvent,
  GeckoEventRetentionCategory,
  GeckoEventType,
} from "./types";

type EventAppearance = {
  badgeClassName: string;
  label: string;
};

const EVENT_APPEARANCE: Record<GeckoEventType, EventAppearance> = {
  emergence: {
    badgeClassName: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
    label: "Emergence",
  },
  feeding_likely: {
    badgeClassName: "border-amber-300/30 bg-amber-300/10 text-amber-100",
    label: "Likely Feeding",
  },
  roaming: {
    badgeClassName: "border-sky-400/20 bg-sky-400/10 text-sky-200",
    label: "Roaming",
  },
  hide_entry_dry: {
    badgeClassName: "border-violet-400/20 bg-violet-400/10 text-violet-200",
    label: "Dry Hide Entry",
  },
  hide_entry_rock: {
    badgeClassName: "border-indigo-400/20 bg-indigo-400/10 text-indigo-200",
    label: "Rock Hide Entry",
  },
  unknown: {
    badgeClassName: "border-white/15 bg-white/10 text-gray-200",
    label: "Motion",
  },
};

export function eventHasClip(event: GeckoEvent): boolean {
  return Boolean(event.clipUrl);
}

export function getEventTypeLabel(eventType: GeckoEventType | undefined): string | null {
  if (!eventType) return null;
  return EVENT_APPEARANCE[eventType].label;
}

export function getEventAppearance(
  eventType: GeckoEventType | undefined
): EventAppearance | null {
  if (!eventType) return null;
  return EVENT_APPEARANCE[eventType];
}

export function getEventRetentionCategory(
  event: GeckoEvent
): GeckoEventRetentionCategory {
  return event.retentionCategory ?? (eventHasClip(event) ? "keep_video" : "summary_only");
}

export function getEventSummary(event: GeckoEvent): string | null {
  return event.behaviorSummary ?? getEventTypeLabel(event.eventType);
}

export function shouldNotifyEvent(event: GeckoEvent): boolean {
  return event.eventType === "emergence" || event.eventType === "feeding_likely";
}
