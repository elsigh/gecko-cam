import type { Metadata } from "next";
import Link from "next/link";
import { FileText, Users, Plus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { listDocuments } from "@/lib/documents";
import { listUsers } from "@/lib/users";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default async function AdminDashboard() {
  const [docsResult, usersResult] = await Promise.all([
    listDocuments({ limit: 100 }),
    listUsers({ limit: 100 }),
  ]);

  const totalDocs = docsResult.documents.length;
  const publishedDocs = docsResult.documents.filter(
    (d) => d.document.status === "published"
  ).length;
  const draftDocs = docsResult.documents.filter(
    (d) => d.document.status === "draft"
  ).length;
  const totalUsers = usersResult.users.length;

  const recentDocs = docsResult.documents
    .sort((a, b) => b.metadata.updatedAt - a.metadata.updatedAt)
    .slice(0, 5);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <Button asChild>
          <Link href="/admin/documents/new">
            <Plus className="mr-2 h-4 w-4" />
            New Document
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              Total Documents
            </CardTitle>
            <FileText className="h-4 w-4 text-zinc-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalDocs}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Published</CardTitle>
            <FileText className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{publishedDocs}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Drafts</CardTitle>
            <FileText className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{draftDocs}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Users</CardTitle>
            <Users className="h-4 w-4 text-zinc-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalUsers}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Documents</CardTitle>
        </CardHeader>
        <CardContent>
          {recentDocs.length === 0 ? (
            <p className="text-sm text-zinc-500">No documents yet.</p>
          ) : (
            <div className="space-y-2">
              {recentDocs.map((doc) => (
                <Link
                  key={`${doc.document.type}-${doc.document.id}`}
                  href={`/admin/documents/${doc.document.type}/${doc.document.id}`}
                  className="flex items-center justify-between rounded-md p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                  <div>
                    <div className="font-medium">{doc.document.title}</div>
                    <div className="text-sm text-zinc-500">
                      /{doc.document.slug}
                    </div>
                  </div>
                  <div className="text-sm text-zinc-500">
                    {new Date(doc.metadata.updatedAt).toLocaleDateString()}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
