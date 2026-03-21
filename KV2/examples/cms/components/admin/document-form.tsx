"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { MarkdownEditor } from "./markdown-editor";
import { DocumentPreview, PreviewToggleButton } from "./document-preview";
import {
  useCreateDocument,
  useUpdateDocument,
} from "@/lib/hooks/use-documents";
import type { Document, DocumentMetadata } from "@/lib/types";

interface DocumentFormProps {
  document?: Document;
  metadata?: DocumentMetadata;
  mode: "create" | "edit";
}

const statusOptions = [
  { value: "draft", label: "Draft" },
  { value: "published", label: "Published" },
  { value: "archived", label: "Archived" },
];

const defaultDocTypes = [
  { value: "page", label: "Page" },
  { value: "post", label: "Post" },
  { value: "doc", label: "Doc" },
  { value: "changelog", label: "Changelog" },
  { value: "article", label: "Article" },
];

export function DocumentForm({ document, metadata, mode }: DocumentFormProps) {
  const router = useRouter();
  const { createDocument, isCreating } = useCreateDocument();
  const { updateDocument, isUpdating } = useUpdateDocument(
    document?.type ?? "",
    document?.id ?? ""
  );

  const [formData, setFormData] = useState({
    type: document?.type ?? "page",
    title: document?.title ?? "",
    slug: document?.slug ?? "",
    body: document?.body ?? "",
    status: document?.status ?? "draft",
    urls: document?.urls?.join("\n") ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [customType, setCustomType] = useState("");
  const [showCustomType, setShowCustomType] = useState(
    document?.type ? !defaultDocTypes.some((t) => t.value === document.type) : false
  );
  const [showPreview, setShowPreview] = useState(false);

  const isSubmitting = isCreating || isUpdating;
  const currentType = showCustomType ? customType : formData.type;

  const generateSlug = (title: string) => {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  };

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const title = e.target.value;
    setFormData((prev) => ({
      ...prev,
      title,
      slug: prev.slug || generateSlug(title),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const urls = formData.urls
      .split("\n")
      .map((url) => url.trim())
      .filter((url) => url.length > 0);

    const docType = showCustomType ? customType : formData.type;

    try {
      if (mode === "create") {
        const result = await createDocument({
          type: docType,
          title: formData.title,
          slug: formData.slug,
          body: formData.body,
          status: formData.status as "draft" | "published" | "archived",
          urls,
        });
        router.push(`/admin/documents/${result.document.type}/${result.document.id}`);
      } else if (document && metadata) {
        await updateDocument({
          title: formData.title,
          slug: formData.slug,
          body: formData.body,
          status: formData.status as "draft" | "published" | "archived",
          urls,
          expectedVersion: metadata.version,
        });
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    }
  };

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="rounded-md bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
            {error}
          </div>
        )}

        {/* Metadata bar */}
        <div className="flex flex-wrap items-end gap-4 rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900">
          {mode === "create" && (
            <div className="space-y-1.5">
              <Label htmlFor="type" className="text-xs">Collection</Label>
              <div className="flex gap-2">
                {!showCustomType ? (
                  <>
                    <Select
                      value={formData.type}
                      onValueChange={(value) =>
                        setFormData((prev) => ({ ...prev, type: value }))
                      }
                      options={defaultDocTypes}
                      className="w-32"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowCustomType(true)}
                    >
                      Custom
                    </Button>
                  </>
                ) : (
                  <>
                    <Input
                      value={customType}
                      onChange={(e) => setCustomType(e.target.value)}
                      placeholder="Custom type"
                      className="w-32"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowCustomType(false)}
                    >
                      Standard
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}

          <div className="space-y-1.5 flex-1 min-w-[200px]">
            <Label htmlFor="title" className="text-xs">Title</Label>
            <Input
              id="title"
              value={formData.title}
              onChange={handleTitleChange}
              placeholder="Document title"
              required
            />
          </div>

          <div className="space-y-1.5 flex-1 min-w-[200px]">
            <Label htmlFor="slug" className="text-xs">Slug</Label>
            <Input
              id="slug"
              value={formData.slug}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, slug: e.target.value }))
              }
              placeholder="url-friendly-slug"
              pattern="^[a-z0-9/.-]+$"
              title="Lowercase letters, numbers, dashes, dots, and slashes"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="status" className="text-xs">Status</Label>
            <Select
              value={formData.status}
              onValueChange={(value) =>
                setFormData((prev) => ({
                  ...prev,
                  status: value as "draft" | "published" | "archived",
                }))
              }
              options={statusOptions}
              className="w-32"
            />
          </div>

          {/* Preview toggle in the metadata bar */}
          <div className="space-y-1.5">
            <Label className="text-xs opacity-0">Preview</Label>
            <PreviewToggleButton
              onClick={() => setShowPreview(!showPreview)}
              isActive={showPreview}
            />
          </div>
        </div>

        {/* Editor */}
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden">
          <MarkdownEditor
            value={formData.body}
            onChange={(value) => setFormData((prev) => ({ ...prev, body: value }))}
            placeholder="Write your content..."
          />
        </div>

        {/* Advanced options (collapsible) */}
        <details className="group">
          <summary className="cursor-pointer text-sm font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
            Advanced options
          </summary>
          <div className="mt-4 space-y-4 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
            <div className="space-y-2">
              <Label htmlFor="urls" className="text-sm">Additional URLs (one per line)</Label>
              <Textarea
                id="urls"
                value={formData.urls}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, urls: e.target.value }))
                }
                placeholder="/alternative-url&#10;/another-url"
                rows={3}
              />
              <p className="text-xs text-zinc-500">
                These URLs will also serve this document (no redirect)
              </p>
            </div>
          </div>
        </details>

        {/* Actions */}
        <div className="flex items-center justify-between">
          <div className="flex gap-2">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting
                ? "Saving..."
                : mode === "create"
                  ? "Create Document"
                  : "Save Changes"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => router.back()}
            >
              Cancel
            </Button>
          </div>

          {metadata && (
            <p className="text-xs text-zinc-500">
              Version {metadata.version} · Last updated{" "}
              {new Date(metadata.updatedAt).toLocaleString()}
            </p>
          )}
        </div>
      </form>

      {/* Picture-in-Picture Preview */}
      <DocumentPreview
        title={formData.title}
        body={formData.body}
        type={currentType}
        slug={formData.slug}
        isOpen={showPreview}
        onClose={() => setShowPreview(false)}
      />
    </>
  );
}
