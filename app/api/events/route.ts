import { NextRequest, NextResponse } from "next/server";
import { listEvents, saveEvent } from "@/lib/kv";
import { validateApiSecret } from "@/lib/auth";
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

  const event: GeckoEvent = {
    id,
    timestamp: Number(timestamp),
    clipUrl,
    thumbnailUrl,
    duration: Number(duration) || 0,
    motionScore: Number(motionScore) || 0,
  };

  try {
    await saveEvent(event);
    return NextResponse.json({ ok: true, event }, { status: 201 });
  } catch (err) {
    console.error("POST /api/events error:", err);
    return NextResponse.json({ error: "Failed to save event" }, { status: 500 });
  }
}
