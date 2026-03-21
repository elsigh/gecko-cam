import { type NextRequest, NextResponse } from "next/server";
import { kv } from "@/lib/kv";

// GET /api/kv - List all keys
// GET /api/kv?key=foo - Get specific key
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const key = searchParams.get("key");
  const prefix = searchParams.get("prefix") ?? "";

  if (key) {
    // Get specific key
    const result = await kv.get(key);
    if (!result.exists) {
      return NextResponse.json({ error: "Key not found" }, { status: 404 });
    }
    const value = await result.value;
    return NextResponse.json({
      key,
      value,
      metadata: result.metadata,
    });
  }

  // List all keys with optional prefix
  const keys: string[] = [];
  for await (const k of kv.keys(prefix)) {
    keys.push(k);
  }

  return NextResponse.json({ keys });
}

// POST /api/kv - Create/Update a key
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { key, value, metadata } = body;

    if (!key || typeof key !== "string") {
      return NextResponse.json(
        { error: "Key is required and must be a string" },
        { status: 400 }
      );
    }

    await kv.set(key, value, metadata);

    return NextResponse.json({ success: true, key });
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }
}

// DELETE /api/kv?key=foo - Delete a key
export async function DELETE(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const key = searchParams.get("key");

  if (!key) {
    return NextResponse.json({ error: "Key is required" }, { status: 400 });
  }

  await kv.delete(key);

  return NextResponse.json({ success: true, key });
}
