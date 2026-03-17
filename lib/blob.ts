import { del } from "@vercel/blob";

export async function deleteBlob(url: string): Promise<void> {
  await del(url);
}

export async function deleteEventBlobs(
  clipUrl: string,
  thumbnailUrl: string
): Promise<void> {
  await Promise.all([deleteBlob(clipUrl), deleteBlob(thumbnailUrl)]);
}
