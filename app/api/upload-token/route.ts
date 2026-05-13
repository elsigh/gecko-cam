import { NextRequest, NextResponse } from "next/server";
import { generateClientTokenFromReadWriteToken } from "@vercel/blob/client";
import { validateApiSecret } from "@/lib/auth";
import { getRequestIp, takeRateLimit } from "@/lib/rate-limit";

const UPLOAD_TOKEN_WINDOW_MS = 5 * 60 * 1000;
const UPLOAD_TOKEN_LIMIT = 30;
const CLIENT_TOKEN_TTL_MS = 5 * 60 * 1000;
const CLIP_MAX_SIZE_BYTES = 200 * 1024 * 1024;
const THUMBNAIL_MAX_SIZE_BYTES = 10 * 1024 * 1024;

type UploadTarget = {
  allowedContentTypes: string[];
  maximumSizeInBytes: number;
};

function getUploadTarget(pathname: string): UploadTarget | null {
  if (/^clips\/[0-9a-f-]{36}\.mp4$/i.test(pathname)) {
    return {
      allowedContentTypes: ["video/mp4"],
      maximumSizeInBytes: CLIP_MAX_SIZE_BYTES,
    };
  }

  if (/^thumbnails\/[0-9a-f-]{36}_thumb\.jpg$/i.test(pathname)) {
    return {
      allowedContentTypes: ["image/jpeg"],
      maximumSizeInBytes: THUMBNAIL_MAX_SIZE_BYTES,
    };
  }

  return null;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!validateApiSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateLimit = takeRateLimit(`upload-token:${getRequestIp(request)}`, {
    limit: UPLOAD_TOKEN_LIMIT,
    windowMs: UPLOAD_TOKEN_WINDOW_MS,
  });
  if (!rateLimit.ok) {
    return NextResponse.json(
      { error: "Too many upload token requests" },
      {
        status: 429,
        headers: {
          "Retry-After": String(rateLimit.retryAfterSeconds),
        },
      }
    );
  }

  let pathname: string | undefined;
  try {
    ({ pathname } = await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!pathname || typeof pathname !== "string") {
    return NextResponse.json({ error: "pathname required" }, { status: 400 });
  }

  const uploadTarget = getUploadTarget(pathname);
  if (!uploadTarget) {
    return NextResponse.json(
      { error: "Invalid upload pathname" },
      { status: 400 }
    );
  }

  const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
  if (!blobToken) {
    console.error("POST /api/upload-token error: BLOB_READ_WRITE_TOKEN not configured");
    return NextResponse.json(
      { error: "Upload token service not configured" },
      { status: 500 }
    );
  }

  try {
    const clientToken = await generateClientTokenFromReadWriteToken({
      token: blobToken,
      pathname,
      allowedContentTypes: uploadTarget.allowedContentTypes,
      maximumSizeInBytes: uploadTarget.maximumSizeInBytes,
      validUntil: Date.now() + CLIENT_TOKEN_TTL_MS,
    });

    return NextResponse.json({ clientToken });
  } catch (err) {
    console.error(
      "POST /api/upload-token error:",
      err instanceof Error ? err.message : String(err)
    );
    return NextResponse.json(
      { error: "Failed to generate upload token" },
      { status: 500 }
    );
  }
}
