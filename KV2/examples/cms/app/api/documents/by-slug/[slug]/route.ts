import { NextResponse } from "next/server";
import { getDocumentBySlug } from "@/lib/documents";

type RouteParams = { params: Promise<{ slug: string }> };

// GET /api/documents/by-slug/[slug] - Get document by slug (public)
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { slug } = await params;

    const result = await getDocumentBySlug(slug);
    if (!result) {
      return NextResponse.json(
        { error: "Document not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Get document by slug error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
