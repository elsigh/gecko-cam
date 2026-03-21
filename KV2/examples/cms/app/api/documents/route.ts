import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { createDocument, listDocuments } from "@/lib/documents";
import { ConflictError } from "@/lib/types";
import { revalidateDocument } from "@/lib/cache";

const createDocumentSchema = z.object({
  type: z.string().min(1),
  title: z.string().min(1),
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9/.-]+$/, "Slug must be lowercase alphanumeric with dashes, dots, and slashes"),
  body: z.string(),
  status: z.enum(["draft", "published", "archived"]),
  urls: z.array(z.string()).optional().default([]),
});

// GET /api/documents - List documents
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const type = searchParams.get("type") ?? undefined;
    const status = searchParams.get("status") as
      | "draft"
      | "published"
      | "archived"
      | undefined;
    const limit = searchParams.get("limit")
      ? parseInt(searchParams.get("limit")!, 10)
      : undefined;
    const cursor = searchParams.get("cursor") ?? undefined;

    const result = await listDocuments({ type, status, limit, cursor });

    return NextResponse.json(result);
  } catch (error) {
    console.error("List documents error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST /api/documents - Create document
export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const input = createDocumentSchema.parse(body);

    const result = await createDocument(
      {
        type: input.type,
        title: input.title,
        slug: input.slug,
        body: input.body,
        status: input.status,
        urls: input.urls,
        author: session.userId,
      },
      session.userId
    );

    // Revalidate cache for the new document
    await revalidateDocument(
      result.document.type,
      result.document.id,
      result.document.slug
    );

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request", details: error.errors },
        { status: 400 }
      );
    }
    if (error instanceof ConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error("Create document error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
