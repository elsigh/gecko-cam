import { NextRequest, NextResponse } from "next/server";
import { validateApiSecret } from "@/lib/auth";

export async function POST(request: NextRequest) {
  if (!validateApiSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  console.log("[motion-log]", JSON.stringify(body));
  return NextResponse.json({ ok: true });
}
