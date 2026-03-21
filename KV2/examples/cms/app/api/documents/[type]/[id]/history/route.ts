import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { getDocumentHistory, restoreVersion } from "@/lib/documents";
import { NotFoundError, ConflictError } from "@/lib/types";

type RouteParams = { params: Promise<{ type: string; id: string }> };

// GET /api/documents/[type]/[id]/history - Get document history
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { type, id } = await params;

    const history = await getDocumentHistory(type, id);

    return NextResponse.json({ history });
  } catch (error) {
    console.error("Get document history error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

const restoreVersionSchema = z.object({
  version: z.number().int().positive(),
});

// POST /api/documents/[type]/[id]/history - Restore version
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { type, id } = await params;
    const body = await request.json();
    const { version } = restoreVersionSchema.parse(body);

    const result = await restoreVersion(type, id, version, session.userId);

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request", details: error.errors },
        { status: 400 }
      );
    }
    if (error instanceof NotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof ConflictError) {
      return NextResponse.json(
        {
          error: error.message,
          currentVersion: error.currentVersion,
          expectedVersion: error.expectedVersion,
        },
        { status: 409 }
      );
    }
    console.error("Restore version error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
