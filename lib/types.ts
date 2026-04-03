export type Rotation = 0 | 90 | 180 | 270;

export interface GeckoEvent {
  id: string;
  timestamp: number; // Unix ms
  clipUrl: string;
  thumbnailUrl: string;
  duration: number; // seconds
  motionScore: number;
  rotation?: Rotation; // display rotation at capture time
  favorite?: boolean;
}

export interface EventListResponse {
  events: GeckoEvent[];
  nextCursor: string | null;
}

export interface UploadTokenResponse {
  token: string;
  url: string;
}
