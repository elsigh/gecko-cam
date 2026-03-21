import { NextResponse, type NextRequest } from "next/server";
import { getDocumentByUrl } from "@/lib/documents";

// GET /api/documents/by-url?url=/some/path - Get document by URL (public)
export async function GET(request: NextRequest) {
  try {
    const url = request.nextUrl.searchParams.get("url");
    if (!url) {
      return NextResponse.json(
        { error: "URL parameter is required" },
        { status: 400 }
      );
    }

    const result = await getDocumentByUrl(url);
    if (!result) {
      return NextResponse.json(
        { error: "Document not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Get document by URL error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
