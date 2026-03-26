const MEDIA_CHECK_TIMEOUT_MS = 5_000;

async function canReachUrl(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, {
      method: "HEAD",
      cache: "no-store",
      signal: AbortSignal.timeout(MEDIA_CHECK_TIMEOUT_MS),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function delay(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function eventMediaIsAvailable(
  clipUrl: string,
  thumbnailUrl: string,
  retries = 3
): Promise<boolean> {
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const [clipOk, thumbnailOk] = await Promise.all([
      canReachUrl(clipUrl),
      canReachUrl(thumbnailUrl),
    ]);

    if (clipOk && thumbnailOk) {
      return true;
    }

    if (attempt < retries) {
      await delay(400 * (attempt + 1));
    }
  }

  return false;
}
