import { revalidatePath, revalidateTag } from "next/cache";
import { after } from "next/server";
import { NextRequest, NextResponse } from "next/server";
import { listEvents, saveEvent, deleteEvents, getRotation } from "@/lib/kv";
import { deleteEventBlobs } from "@/lib/blob";
import { validateApiSecret, validateSession } from "@/lib/auth";
import { notifyGeckoEvent } from "@/lib/notify";
import type { GeckoEvent } from "@/lib/types";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const cursor = searchParams.get("cursor") ?? undefined;

  try {
    const result = await listEvents(cursor);
    return NextResponse.json(result);
  } catch (err) {
    console.error("GET /api/events error:", err);
    return NextResponse.json({ error: "Failed to fetch events" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!validateApiSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: GeckoEvent;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { id, timestamp, clipUrl, thumbnailUrl, duration, motionScore } = body;

  if (!id || !timestamp || !clipUrl || !thumbnailUrl) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const rotation = await getRotation();

  const event: GeckoEvent = {
    id,
    timestamp: Number(timestamp),
    clipUrl,
    thumbnailUrl,
    duration: Number(duration) || 0,
    motionScore: Number(motionScore) || 0,
    rotation,
  };

  try {
    await saveEvent(event);
    revalidateTag("events-list", "default");
    revalidatePath("/");
    // Use after() so the function stays alive long enough to send the notification
    after(() =>
      notifyGeckoEvent(event).catch((err) =>
        console.error("notifyGeckoEvent error:", String(err))
      )
    );
    return NextResponse.json({ ok: true, event }, { status: 201 });
  } catch (err) {
    console.error("POST /api/events error:", err);
    return NextResponse.json({ error: "Failed to save event" }, { status: 500 });
  }
}

// Batch delete: DELETE /api/events  body: { ids: string[] }
export async function DELETE(request: NextRequest) {
  const allowed = validateApiSecret(request) ||
    (!!process.env.SITE_PASSWORD && validateSession(request));
  if (!allowed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let ids: string[];
  try {
    ({ ids } = await request.json());
    if (!Array.isArray(ids) || ids.length === 0) throw new Error();
  } catch {
    return NextResponse.json({ error: "ids array required" }, { status: 400 });
  }

  try {
    // Single read+write for the events list, blobs deleted in parallel
    const removed = await deleteEvents(ids);
    await Promise.all(removed.map((e) => deleteEventBlobs(e.clipUrl, e.thumbnailUrl)));
    revalidateTag("events-list", "default");
    for (const id of ids) revalidateTag(`event-${id}`, "default");
    revalidatePath("/");
    return NextResponse.json({ ok: true, deleted: removed.length });
  } catch (err) {
    console.error("DELETE /api/events error:", err);
    return NextResponse.json({ error: "Failed to delete events" }, { status: 500 });
  }
}
