"use client";

import useSWR from "swr";
import useSWRMutation from "swr/mutation";
import type {
  Document,
  DocumentMetadata,
  DocumentWithMetadata,
  VersionHistoryEntry,
} from "../types";

// Fetcher for SWR
async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(error.error ?? "Request failed");
  }
  return res.json();
}

// List documents
interface ListDocumentsResponse {
  documents: DocumentWithMetadata[];
  cursor?: string;
}

export function useDocuments(options?: {
  type?: string;
  status?: "draft" | "published" | "archived";
  limit?: number;
}) {
  const params = new URLSearchParams();
  if (options?.type) params.set("type", options.type);
  if (options?.status) params.set("status", options.status);
  if (options?.limit) params.set("limit", options.limit.toString());

  const url = `/api/documents${params.toString() ? `?${params}` : ""}`;

  const { data, error, isLoading, mutate } = useSWR<ListDocumentsResponse>(
    url,
    fetcher
  );

  return {
    documents: data?.documents ?? [],
    cursor: data?.cursor,
    isLoading,
    error,
    mutate,
  };
}

// Get single document
export function useDocument(type: string, id: string) {
  const { data, error, isLoading, mutate } = useSWR<DocumentWithMetadata>(
    type && id ? `/api/documents/${type}/${id}` : null,
    fetcher
  );

  return {
    document: data?.document ?? null,
    metadata: data?.metadata ?? null,
    isLoading,
    error,
    mutate,
  };
}

// Get document by slug
export function useDocumentBySlug(slug: string) {
  const { data, error, isLoading, mutate } = useSWR<DocumentWithMetadata>(
    slug ? `/api/documents/by-slug/${slug}` : null,
    fetcher
  );

  return {
    document: data?.document ?? null,
    metadata: data?.metadata ?? null,
    isLoading,
    error,
    mutate,
  };
}

// Get document history
interface HistoryResponse {
  history: VersionHistoryEntry[];
}

export function useDocumentHistory(type: string, id: string) {
  const { data, error, isLoading, mutate } = useSWR<HistoryResponse>(
    type && id ? `/api/documents/${type}/${id}/history` : null,
    fetcher
  );

  return {
    history: data?.history ?? [],
    isLoading,
    error,
    mutate,
  };
}

// Create document mutation
interface CreateDocumentInput {
  type: string;
  title: string;
  slug: string;
  body: string;
  status: "draft" | "published" | "archived";
  urls?: string[];
}

async function createDocument(
  url: string,
  { arg }: { arg: CreateDocumentInput }
): Promise<DocumentWithMetadata> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(arg),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ error: "Request failed" }));
    // Include validation details in error message
    let message = errorData.error ?? "Failed to create document";
    if (errorData.details?.length) {
      const fields = errorData.details.map((d: { path: string[]; message: string }) =>
        `${d.path.join(".")}: ${d.message}`
      ).join(", ");
      message = `${message} (${fields})`;
    }
    throw new Error(message);
  }

  return res.json();
}

export function useCreateDocument() {
  const { trigger, isMutating, error } = useSWRMutation(
    "/api/documents",
    createDocument
  );

  return {
    createDocument: trigger,
    isCreating: isMutating,
    error,
  };
}

// Update document mutation
interface UpdateDocumentInput {
  title?: string;
  slug?: string;
  body?: string;
  status?: "draft" | "published" | "archived";
  urls?: string[];
  expectedVersion: number;
}

async function updateDocument(
  url: string,
  { arg }: { arg: UpdateDocumentInput }
): Promise<DocumentWithMetadata> {
  const res = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(arg),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ error: "Request failed" }));
    // Include validation details in error message
    let message = errorData.error ?? "Failed to update document";
    if (errorData.details?.length) {
      const fields = errorData.details.map((d: { path: string[]; message: string }) =>
        `${d.path.join(".")}: ${d.message}`
      ).join(", ");
      message = `${message} (${fields})`;
    }
    throw new Error(message);
  }

  return res.json();
}

export function useUpdateDocument(type: string, id: string) {
  const { trigger, isMutating, error } = useSWRMutation(
    `/api/documents/${type}/${id}`,
    updateDocument
  );

  return {
    updateDocument: trigger,
    isUpdating: isMutating,
    error,
  };
}

// Delete document mutation
async function deleteDocument(url: string): Promise<{ success: boolean }> {
  const res = await fetch(url, { method: "DELETE" });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(error.error ?? "Failed to delete document");
  }

  return res.json();
}

export function useDeleteDocument(type: string, id: string) {
  const { trigger, isMutating, error } = useSWRMutation(
    `/api/documents/${type}/${id}`,
    deleteDocument
  );

  return {
    deleteDocument: trigger,
    isDeleting: isMutating,
    error,
  };
}

// Restore version mutation
async function restoreVersion(
  url: string,
  { arg }: { arg: { version: number } }
): Promise<DocumentWithMetadata> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(arg),
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(error.error ?? "Failed to restore version");
  }

  return res.json();
}

export function useRestoreVersion(type: string, id: string) {
  const { trigger, isMutating, error } = useSWRMutation(
    `/api/documents/${type}/${id}/history`,
    restoreVersion
  );

  return {
    restoreVersion: trigger,
    isRestoring: isMutating,
    error,
  };
}
