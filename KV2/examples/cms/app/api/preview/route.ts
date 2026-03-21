import { NextResponse } from "next/server";
import { setPreviewData } from "@/lib/preview-store";

// POST /api/preview - Store preview data and return ID
export async function POST(request: Request) {
  try {
    const { title, body, type, slug, id: existingId } = await request.json();

    // Use existing ID if provided, otherwise generate new one
    const id = existingId || Math.random().toString(36).slice(2, 10);

    await setPreviewData(id, { title, body, type, slug });

    return NextResponse.json({ id });
  } catch (error) {
    console.error("Preview store error:", error);
    return NextResponse.json({ error: "Failed to store preview" }, { status: 500 });
  }
}
