import { NextResponse } from "next/server";
import { getSnoozeUntil } from "@/lib/kv";

// GET /api/armed — public, polled by the Pi before triggering a capture
export async function GET() {
  const snoozeUntil = await getSnoozeUntil();
  const now = Date.now();

  if (snoozeUntil && now < snoozeUntil) {
    return NextResponse.json({
      armed: false,
      snooze_until: snoozeUntil,
      snooze_remaining_s: Math.ceil((snoozeUntil - now) / 1000),
    });
  }

  return NextResponse.json({ armed: true, snooze_until: null });
}
