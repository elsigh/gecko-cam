export type Rotation = 0 | 90 | 180 | 270;
export type GeckoEventType =
  | "emergence"
  | "feeding_likely"
  | "roaming"
  | "hide_entry_dry"
  | "hide_entry_rock"
  | "unknown";

export type GeckoEventZone = "bowl" | "dry_hide" | "rock_hide" | "open";
export type GeckoEventRetentionCategory = "keep_video" | "summary_only" | "review";

export interface GeckoEvent {
  id: string;
  timestamp: number; // Unix ms
  clipUrl: string | null;
  thumbnailUrl: string;
  duration: number; // seconds
  motionScore: number;
  rotation?: Rotation; // display rotation at capture time
  favorite?: boolean;
  eventType?: GeckoEventType;
  behaviorSummary?: string;
  sourceZone?: GeckoEventZone | null;
  targetZone?: GeckoEventZone | null;
  retentionCategory?: GeckoEventRetentionCategory;
}

export interface EventListResponse {
  events: GeckoEvent[];
  nextCursor: string | null;
}

export interface UploadTokenResponse {
  token: string;
  url: string;
}
