import { NextRequest, NextResponse } from "next/server";
import { generateClientTokenFromReadWriteToken } from "@vercel/blob/client";
import { validateApiSecret } from "@/lib/auth";

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!validateApiSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { pathname } = await request.json();

  if (!pathname || typeof pathname !== "string") {
    return NextResponse.json({ error: "pathname required" }, { status: 400 });
  }

  const allowed = pathname.endsWith(".mp4") || pathname.endsWith(".jpg");
  if (!allowed) {
    return NextResponse.json(
      { error: "Only .mp4 and .jpg files are allowed" },
      { status: 400 }
    );
  }

  try {
    const clientToken = await generateClientTokenFromReadWriteToken({
      token: process.env.BLOB_READ_WRITE_TOKEN!,
      pathname,
      onUploadCompleted: async ({ blob }) => {
        console.log("Blob upload completed:", blob.url);
      },
      allowedContentTypes: ["video/mp4", "image/jpeg"],
      maximumSizeInBytes: 200 * 1024 * 1024, // 200 MB
    });

    return NextResponse.json({ clientToken });
  } catch (err) {
    console.error("POST /api/upload-token error:", err);
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
