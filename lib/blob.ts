import { del } from "@vercel/blob";

export async function deleteBlob(url: string | null | undefined): Promise<void> {
  if (!url) return;
  await del(url);
}

export async function deleteEventBlobs(
  clipUrl: string | null | undefined,
  thumbnailUrl: string
): Promise<void> {
  await Promise.all([deleteBlob(clipUrl), deleteBlob(thumbnailUrl)]);
}
