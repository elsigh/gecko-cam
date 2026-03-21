import { KV2 } from "@vercel/kv2";

// Singleton KV instance for the app
// Requires BLOB_READ_WRITE_TOKEN environment variable
export const kv = new KV2({
  prefix: "demo/",
});

export type KVEntryInfo = {
  key: string;
  value: unknown;
  metadata?: unknown;
};
