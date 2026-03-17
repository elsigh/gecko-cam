export interface GeckoEvent {
  id: string;
  timestamp: number; // Unix ms
  clipUrl: string;
  thumbnailUrl: string;
  duration: number; // seconds
  motionScore: number;
}

export interface EventListResponse {
  events: GeckoEvent[];
  nextCursor: string | null;
}

export interface UploadTokenResponse {
  token: string;
  url: string;
}
