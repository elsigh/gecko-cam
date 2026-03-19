import { NextRequest, NextResponse } from "next/server";
import { getRotation, setRotation } from "@/lib/kv";
import { validateSession } from "@/lib/auth";
import type { Rotation } from "@/lib/types";

export async function GET() {
  const rotation = await getRotation();
  return NextResponse.json({ rotation });
}

export async function POST(request: NextRequest) {
  if (!validateSession(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let rotation: number;
  try {
    ({ rotation } = await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (rotation !== 0 && rotation !== 90 && rotation !== 180 && rotation !== 270) {
    return NextResponse.json({ error: "Invalid rotation" }, { status: 400 });
  }

  await setRotation(rotation as Rotation);
  return NextResponse.json({ ok: true });
}
