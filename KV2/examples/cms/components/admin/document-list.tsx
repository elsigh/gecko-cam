"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Pencil, Trash2, Eye, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useDocuments, useDeleteDocument } from "@/lib/hooks/use-documents";
import type { DocumentWithMetadata } from "@/lib/types";
import { useState } from "react";

interface DocumentListProps {
  type?: string;
  status?: "draft" | "published" | "archived";
}

function getStatusBadgeVariant(status: string) {
  switch (status) {
    case "published":
      return "success";
    case "draft":
      return "secondary";
    case "archived":
      return "outline";
    default:
      return "default";
  }
}

function DocumentRow({ doc, onDelete }: { doc: DocumentWithMetadata; onDelete: () => void }) {
  const { deleteDocument, isDeleting } = useDeleteDocument(
    doc.document.type,
    doc.document.id
  );
  const router = useRouter();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleDelete = async () => {
    await deleteDocument();
    onDelete();
  };

  return (
    <div className="flex items-center justify-between border-b border-zinc-100 py-3 last:border-0 dark:border-zinc-800">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <Link
            href={`/admin/documents/${doc.document.type}/${doc.document.id}`}
            className="font-medium hover:underline truncate"
          >
            {doc.document.title}
          </Link>
          <Badge variant={getStatusBadgeVariant(doc.document.status)}>
            {doc.document.status}
          </Badge>
          <Badge variant="outline">{doc.document.type}</Badge>
        </div>
        <div className="mt-1 flex items-center gap-2 text-sm text-zinc-500">
          <span>/{doc.document.slug}</span>
          <span>·</span>
          <span>v{doc.metadata.version}</span>
          <span>·</span>
          <span>
            {new Date(doc.metadata.updatedAt).toLocaleDateString()}
          </span>
        </div>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link href={`/${doc.document.slug}`} target="_blank">
              <Eye className="mr-2 h-4 w-4" />
              View
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link
              href={`/admin/documents/${doc.document.type}/${doc.document.id}`}
            >
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {!showDeleteConfirm ? (
            <DropdownMenuItem
              onClick={() => setShowDeleteConfirm(true)}
              className="text-red-600 focus:text-red-600"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              onClick={handleDelete}
              disabled={isDeleting}
              className="text-red-600 focus:text-red-600"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {isDeleting ? "Deleting..." : "Confirm Delete"}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function DocumentList({ type, status }: DocumentListProps) {
  const { documents, isLoading, error, mutate } = useDocuments({
    type,
    status,
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-zinc-500">
          Loading documents...
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-red-500">
          Error loading documents: {error.message}
        </CardContent>
      </Card>
    );
  }

  if (documents.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-zinc-500">
          No documents found.{" "}
          <Link href="/admin/documents/new" className="text-zinc-900 underline dark:text-zinc-50">
            Create one
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Documents</CardTitle>
        <CardDescription>
          {documents.length} document{documents.length !== 1 ? "s" : ""}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {documents.map((doc) => (
          <DocumentRow
            key={`${doc.document.type}-${doc.document.id}`}
            doc={doc}
            onDelete={() => mutate()}
          />
        ))}
      </CardContent>
    </Card>
  );
}
