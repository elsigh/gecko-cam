import { NextRequest, NextResponse } from "next/server";
import { validateSession } from "@/lib/auth";
import { setSnooze, clearSnooze } from "@/lib/kv";

// POST /api/snooze  { minutes: number }  — start snooze
export async function POST(request: NextRequest) {
  if (!validateSession(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { minutes } = await request.json();
  if (!minutes || typeof minutes !== "number" || minutes <= 0) {
    return NextResponse.json({ error: "minutes required" }, { status: 400 });
  }

  const untilMs = Date.now() + minutes * 60 * 1000;
  await setSnooze(untilMs);
  return NextResponse.json({ ok: true, snooze_until: untilMs });
}

// DELETE /api/snooze  — cancel snooze
export async function DELETE(request: NextRequest) {
  if (!validateSession(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await clearSnooze();
  return NextResponse.json({ ok: true });
}
