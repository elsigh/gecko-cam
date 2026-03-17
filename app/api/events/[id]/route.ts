import { NextRequest, NextResponse } from "next/server";
import { deleteEvent, getEvent } from "@/lib/kv";
import { deleteEventBlobs } from "@/lib/blob";
import { validateApiSecret } from "@/lib/auth";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!validateApiSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const event = await getEvent(id);
    if (!event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    await Promise.all([
      deleteEventBlobs(event.clipUrl, event.thumbnailUrl),
      deleteEvent(id),
    ]);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(`DELETE /api/events/${id} error:`, err);
    return NextResponse.json({ error: "Failed to delete event" }, { status: 500 });
  }
}
