/**
 * Preview data store using KV for production persistence.
 * Previews expire after 5 minutes.
 */

import { createKV } from "@vercel/kv2";

export interface PreviewData {
  title: string;
  body: string;
  type: string;
  slug: string;
  createdAt: number;
}

interface PreviewMetadata {
  expiresAt: number;
}

const PREVIEW_TTL = 5 * 60 * 1000; // 5 minutes

// Create a dedicated KV store for previews
const baseKV = createKV({ prefix: "cms/", env: "production", branch: "main" });
const previewKV = baseKV.getStore<PreviewData, PreviewMetadata>("preview/");

export async function setPreviewData(
  id: string,
  data: Omit<PreviewData, "createdAt">
): Promise<void> {
  const now = Date.now();
  await previewKV.set(
    id,
    { ...data, createdAt: now },
    { expiresAt: now + PREVIEW_TTL }
  );
}

export async function getPreviewData(id: string): Promise<PreviewData | null> {
  const result = await previewKV.get(id);

  if (!result.exists) {
    return null;
  }

  const data = await result.value;
  const metadata = result.metadata;

  // Check if expired
  if (metadata && Date.now() > metadata.expiresAt) {
    // Clean up expired entry
    await previewKV.delete(id);
    return null;
  }

  return data;
}

export async function deletePreviewData(id: string): Promise<void> {
  await previewKV.delete(id);
}
