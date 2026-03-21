import { KVIndexConflictError } from "@vercel/kv2";
import {
  documentsKV,
  historyKV,
  encodeUrlKey,
} from "./kv";
import type {
  Document,
  DocumentMetadata,
  DocumentWithMetadata,
  VersionHistoryEntry,
} from "./types";
import { ConflictError, NotFoundError } from "./types";

// Helper to build document key
function docKey(type: string, id: string): string {
  return `${type}/${id}`;
}

// Helper to build history key
function historyKey(type: string, id: string, version: number): string {
  return `${type}/${id}/${version}`;
}

// Generate a unique document ID
function generateDocId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `${timestamp}-${random}`;
}

// Create a new document
export async function createDocument(
  input: Omit<Document, "id" | "createdAt">,
  userId: string
): Promise<DocumentWithMetadata> {
  const id = generateDocId();
  const now = Date.now();

  const document: Document = {
    ...input,
    id,
    createdAt: now,
  };

  const metadata: DocumentMetadata = {
    updatedAt: now,
    updatedBy: userId,
    version: 1,
    publishedAt: input.status === "published" ? now : undefined,
  };

  try {
    await documentsKV.set(docKey(document.type, id), document, metadata);
  } catch (e) {
    if (e instanceof KVIndexConflictError) {
      throw new ConflictError({
        message: e.indexName === "bySlug"
          ? `Slug "${document.slug}" is already in use`
          : `URL is already in use`,
        currentVersion: 0,
        expectedVersion: 0,
      });
    }
    throw e;
  }

  return { document, metadata };
}

// Get a document by type and id
export async function getDocument(
  type: string,
  id: string
): Promise<DocumentWithMetadata | null> {
  const result = await documentsKV.get(docKey(type, id));
  if (!result.exists) {
    return null;
  }
  const document = await result.value;
  return { document, metadata: result.metadata };
}

// Get a document by slug
export async function getDocumentBySlug(
  slug: string
): Promise<DocumentWithMetadata | null> {
  const result = await documentsKV.get({ bySlug: slug });
  if (!result.exists) {
    return null;
  }
  const document = await result.value;
  return { document, metadata: result.metadata };
}

// Get a document by URL
export async function getDocumentByUrl(
  url: string
): Promise<DocumentWithMetadata | null> {
  const encodedUrl = encodeUrlKey(url);
  const result = await documentsKV.get({ byUrl: encodedUrl });
  if (!result.exists) {
    return null;
  }
  const document = await result.value;
  return { document, metadata: result.metadata };
}

// Update a document with version check
export async function updateDocument(
  type: string,
  id: string,
  updates: Partial<Omit<Document, "id" | "type" | "createdAt">>,
  expectedVersion: number,
  userId: string
): Promise<DocumentWithMetadata> {
  const current = await getDocument(type, id);
  if (!current) {
    throw new NotFoundError(`Document ${type}/${id} not found`);
  }

  // Check version for optimistic locking
  if (current.metadata.version !== expectedVersion) {
    throw new ConflictError({
      message: "Document was modified by another user",
      currentVersion: current.metadata.version,
      expectedVersion,
    });
  }

  const now = Date.now();
  const oldDoc = current.document;

  // Build updated document
  const updatedDoc: Document = {
    ...oldDoc,
    ...updates,
  };

  // Archive current version to history
  const historyEntry: VersionHistoryEntry = {
    document: oldDoc,
    metadata: current.metadata,
    archivedAt: now,
    archivedBy: userId,
  };
  await historyKV.set(
    historyKey(type, id, current.metadata.version),
    historyEntry
  );

  // Update document with new version
  const newMetadata: DocumentMetadata = {
    updatedAt: now,
    updatedBy: userId,
    version: expectedVersion + 1,
    publishedAt:
      updatedDoc.status === "published"
        ? current.metadata.publishedAt ?? now
        : current.metadata.publishedAt,
  };

  try {
    await documentsKV.set(docKey(type, id), updatedDoc, newMetadata);
  } catch (e) {
    if (e instanceof KVIndexConflictError) {
      throw new ConflictError({
        message: e.indexName === "bySlug"
          ? `Slug "${updates.slug}" is already in use`
          : `URL is already in use`,
        currentVersion: current.metadata.version,
        expectedVersion,
      });
    }
    throw e;
  }

  return { document: updatedDoc, metadata: newMetadata };
}

// Delete a document
export async function deleteDocument(type: string, id: string): Promise<void> {
  await documentsKV.delete(docKey(type, id));
  // Note: We don't delete history, it's kept for audit trail
}

// List documents with optional type filter and pagination
export async function listDocuments(
  options: {
    type?: string;
    status?: "draft" | "published" | "archived";
    limit?: number;
    cursor?: string;
  } = {}
): Promise<{
  documents: DocumentWithMetadata[];
  cursor?: string;
}> {
  const { type, status, limit = 20, cursor } = options;

  // When status filter is provided, use the index
  if (status) {
    const { entries, cursor: nextCursor } = await documentsKV
      .entries({ byStatus: status })
      .page(limit, cursor);

    const documents: DocumentWithMetadata[] = [];
    for (const [, entry] of entries) {
      const value = await entry.value;
      if (value && entry.metadata) {
        // Apply type filter if specified
        if (type && value.type !== type) {
          continue;
        }
        documents.push({ document: value, metadata: entry.metadata });
      }
    }

    return { documents, cursor: nextCursor };
  }

  // No status filter: scan by prefix
  const prefix = type ? `${type}/` : "";

  const { entries, cursor: nextCursor } = await documentsKV
    .entries(prefix)
    .page(limit, cursor);

  const documents: DocumentWithMetadata[] = [];
  for (const [, entry] of entries) {
    const value = await entry.value;
    if (value && entry.metadata) {
      documents.push({ document: value, metadata: entry.metadata });
    }
  }

  return { documents, cursor: nextCursor };
}

// Get document version history
export async function getDocumentHistory(
  type: string,
  id: string
): Promise<VersionHistoryEntry[]> {
  const prefix = `${type}/${id}/`;
  const history: VersionHistoryEntry[] = [];

  for await (const [, entry] of historyKV.entries<VersionHistoryEntry>(
    prefix
  )) {
    const value = await entry.value;
    if (value) {
      history.push(value);
    }
  }

  // Sort by version descending (most recent first)
  history.sort((a, b) => b.metadata.version - a.metadata.version);

  return history;
}

// Restore a document from history
export async function restoreVersion(
  type: string,
  id: string,
  version: number,
  userId: string
): Promise<DocumentWithMetadata> {
  // Get the history entry
  const historyEntry = await historyKV.getValue<VersionHistoryEntry>(
    historyKey(type, id, version)
  );
  if (!historyEntry) {
    throw new NotFoundError(
      `Version ${version} of document ${type}/${id} not found`
    );
  }

  // Get current document
  const current = await getDocument(type, id);
  if (!current) {
    throw new NotFoundError(`Document ${type}/${id} not found`);
  }

  const historicalDoc = historyEntry.document;

  // Update to historical content (this will archive current version)
  return updateDocument(
    type,
    id,
    {
      title: historicalDoc.title,
      slug: historicalDoc.slug,
      body: historicalDoc.body,
      status: historicalDoc.status,
      urls: historicalDoc.urls,
      author: historicalDoc.author,
    },
    current.metadata.version,
    userId
  );
}
