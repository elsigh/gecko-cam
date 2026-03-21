import { revalidateTag } from "next/cache";

// Cache profile for CMS content - matches cacheLife config in next.config.ts
const CACHE_PROFILE = "cms";

// Cache tags for different content types
export const CACHE_TAGS = {
  // All documents (for index pages)
  documents: "documents",
  // Documents by type (for filtered lists)
  documentType: (type: string) => `documents:${type}`,
  // Individual document by slug
  documentSlug: (slug: string) => `document:${slug}`,
  // Document by id
  documentId: (type: string, id: string) => `document:${type}:${id}`,
} as const;

/**
 * Revalidate cache after document changes.
 * Call this when a document is created, updated, or deleted.
 */
export async function revalidateDocument(
  type: string,
  id: string,
  slug: string,
  oldSlug?: string
) {
  // Revalidate the specific document
  revalidateTag(CACHE_TAGS.documentSlug(slug), CACHE_PROFILE);
  revalidateTag(CACHE_TAGS.documentId(type, id), CACHE_PROFILE);

  // If slug changed, also revalidate old slug
  if (oldSlug && oldSlug !== slug) {
    revalidateTag(CACHE_TAGS.documentSlug(oldSlug), CACHE_PROFILE);
  }

  // Revalidate document lists
  revalidateTag(CACHE_TAGS.documents, CACHE_PROFILE);
  revalidateTag(CACHE_TAGS.documentType(type), CACHE_PROFILE);
}

/**
 * Revalidate cache when a document is deleted.
 */
export async function revalidateDocumentDeletion(
  type: string,
  id: string,
  slug: string
) {
  revalidateTag(CACHE_TAGS.documentSlug(slug), CACHE_PROFILE);
  revalidateTag(CACHE_TAGS.documentId(type, id), CACHE_PROFILE);
  revalidateTag(CACHE_TAGS.documents, CACHE_PROFILE);
  revalidateTag(CACHE_TAGS.documentType(type), CACHE_PROFILE);
}
