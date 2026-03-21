"use client";

import Link from "next/link";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DocumentList } from "@/components/admin/document-list";

const collectionOptions = [
  { value: "", label: "All Collections" },
  { value: "page", label: "Pages" },
  { value: "doc", label: "Docs" },
  { value: "changelog", label: "Changelog" },
  { value: "post", label: "Posts" },
  { value: "article", label: "Articles" },
];

const statusOptions = [
  { value: "", label: "All Statuses" },
  { value: "draft", label: "Draft" },
  { value: "published", label: "Published" },
  { value: "archived", label: "Archived" },
];

export default function DocumentsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const collection = searchParams.get("collection") ?? "";
  const status = searchParams.get("status") ?? "";

  const updateFilter = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Documents</h1>
        <Button asChild>
          <Link href="/admin/documents/new">
            <Plus className="mr-2 h-4 w-4" />
            New Document
          </Link>
        </Button>
      </div>

      <div className="flex gap-3">
        <select
          value={collection}
          onChange={(e) => updateFilter("collection", e.target.value)}
          className="h-9 rounded-md border border-zinc-200 bg-transparent px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-zinc-950 dark:border-zinc-800 dark:focus:ring-zinc-300"
        >
          {collectionOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <select
          value={status}
          onChange={(e) => updateFilter("status", e.target.value)}
          className="h-9 rounded-md border border-zinc-200 bg-transparent px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-zinc-950 dark:border-zinc-800 dark:focus:ring-zinc-300"
        >
          {statusOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <DocumentList
        type={collection || undefined}
        status={(status as "draft" | "published" | "archived") || undefined}
      />
    </div>
  );
}
