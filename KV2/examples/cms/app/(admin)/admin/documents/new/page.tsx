import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { DocumentForm } from "@/components/admin/document-form";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "New Document",
};

export default function NewDocumentPage() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/admin/documents">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Documents
          </Link>
        </Button>
      </div>
      <DocumentForm mode="create" />
    </div>
  );
}
