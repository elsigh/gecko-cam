import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, History } from "lucide-react";
import { getDocument } from "@/lib/documents";
import { DocumentForm } from "@/components/admin/document-form";
import { DocumentHistory } from "@/components/admin/document-history";
import { Button } from "@/components/ui/button";

interface EditDocumentPageProps {
  params: Promise<{ type: string; id: string }>;
}

export async function generateMetadata({
  params,
}: EditDocumentPageProps): Promise<Metadata> {
  const { type, id } = await params;
  const result = await getDocument(type, id);

  return {
    title: result ? `Edit: ${result.document.title}` : "Edit Document",
  };
}

export default async function EditDocumentPage({
  params,
}: EditDocumentPageProps) {
  const { type, id } = await params;
  const result = await getDocument(type, id);

  if (!result) {
    notFound();
  }

  return (
    <div className="flex h-full">
      {/* Main content - full width editor */}
      <div className="flex-1 min-w-0 space-y-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/admin/documents">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Documents
            </Link>
          </Button>
        </div>
        <DocumentForm
          document={result.document}
          metadata={result.metadata}
          mode="edit"
        />
      </div>

      {/* History sidebar */}
      <div className="hidden xl:block w-80 flex-shrink-0 border-l border-zinc-200 dark:border-zinc-800 pl-6 ml-6">
        <div className="sticky top-6">
          <div className="flex items-center gap-2 mb-4">
            <History className="h-4 w-4 text-zinc-500" />
            <h2 className="font-semibold">Version History</h2>
          </div>
          <DocumentHistory
            type={type}
            id={id}
            currentVersion={result.metadata.version}
          />
        </div>
      </div>
    </div>
  );
}
