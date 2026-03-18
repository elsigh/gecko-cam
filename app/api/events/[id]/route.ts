import { NextRequest, NextResponse } from "next/server";
import { deleteEvent, getEvent } from "@/lib/kv";
import { deleteEventBlobs } from "@/lib/blob";
import { validateApiSecret, validateSession } from "@/lib/auth";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const event = await getEvent(id);
  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }
  return NextResponse.json(event);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const hasApiSecret = validateApiSecret(request);
  const sitePassword = process.env.SITE_PASSWORD;
  const hasValidSession = sitePassword && validateSession(request);
  const allowed = hasApiSecret || hasValidSession;
  if (!allowed) {
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
