import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import {
  getDocument,
  updateDocument,
  deleteDocument,
} from "@/lib/documents";
import { ConflictError, NotFoundError } from "@/lib/types";
import { revalidateDocument, revalidateDocumentDeletion } from "@/lib/cache";

const updateDocumentSchema = z.object({
  title: z.string().min(1).optional(),
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9/.-]+$/, "Slug must be lowercase alphanumeric with dashes, dots, and slashes")
    .optional(),
  body: z.string().optional(),
  status: z.enum(["draft", "published", "archived"]).optional(),
  urls: z.array(z.string()).optional(),
  expectedVersion: z.number().int().positive(),
});

type RouteParams = { params: Promise<{ type: string; id: string }> };

// GET /api/documents/[type]/[id] - Get document
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { type, id } = await params;

    const result = await getDocument(type, id);
    if (!result) {
      return NextResponse.json(
        { error: "Document not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Get document error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// PATCH /api/documents/[type]/[id] - Update document
export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { type, id } = await params;
    const body = await request.json();
    const input = updateDocumentSchema.parse(body);

    // Get old document to track slug changes
    const oldDoc = await getDocument(type, id);
    const oldSlug = oldDoc?.document.slug;

    const { expectedVersion, ...updates } = input;
    const result = await updateDocument(
      type,
      id,
      updates,
      expectedVersion,
      session.userId
    );

    // Revalidate cache (including old slug if it changed)
    await revalidateDocument(
      result.document.type,
      result.document.id,
      result.document.slug,
      oldSlug
    );

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
    console.error("Update document error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE /api/documents/[type]/[id] - Delete document
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { type, id } = await params;

    // Get document before deletion to get slug for cache invalidation
    const doc = await getDocument(type, id);
    const slug = doc?.document.slug;

    await deleteDocument(type, id);

    // Revalidate cache
    if (slug) {
      await revalidateDocumentDeletion(type, id, slug);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete document error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
