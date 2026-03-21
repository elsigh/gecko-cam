import { createKV } from "@vercel/kv2";
import type { TypedKV } from "@vercel/kv2";
import type {
  Document,
  DocumentMetadata,
  VersionHistoryEntry,
  User,
  Session,
} from "./types";

// Create the base KV store with CMS prefix
// Pin to production/main so preview deployments see real content
const baseKV = createKV({ prefix: "cms/", env: "production", branch: "main" });

// Helper to encode URLs for use as index keys (replace / with __)
export function encodeUrlKey(url: string): string {
  const normalized = url.startsWith("/") ? url.slice(1) : url;
  return encodeURIComponent(normalized).replace(/%2F/g, "__");
}

// Document storage with secondary indexes
export const documentsKV = baseKV
  .getStore<Document, DocumentMetadata>("document/")
  .withIndexes({
    bySlug: {
      key: (doc) => doc.slug,
      unique: true,
    },
    byStatus: {
      key: (doc) => doc.status,
    },
    byUrl: {
      key: (doc) => doc.urls.map(encodeUrlKey),
      unique: true,
    },
  });

// User storage with secondary indexes
export const usersKV = baseKV.getStore<User>("user/").withIndexes({
  byUsername: {
    key: (user) => user.username,
    unique: true,
  },
});

// Version history: cms/history/{type}/{id}/{version}
export const historyKV: TypedKV<VersionHistoryEntry> =
  baseKV.getStore<VersionHistoryEntry>("history/");

// Session storage: cms/session/{sessionId}
export const sessionsKV: TypedKV<Session> =
  baseKV.getStore<Session>("session/");
