import Link from "next/link";
import { cacheTag, cacheLife } from "next/cache";
import { listDocuments, getDocumentBySlug } from "@/lib/documents";
import { Markdown } from "@/components/markdown";
import { PublicLayout } from "@/components/public-layout";
import { CACHE_TAGS } from "@/lib/cache";

export default async function DocsIndexPage() {
  "use cache";
  cacheLife("cms");

  // Tag for doc type and specific docs overview page
  cacheTag(CACHE_TAGS.documentType("doc"));
  cacheTag(CACHE_TAGS.documentSlug("docs"));

  // Get the docs overview page
  const overview = await getDocumentBySlug("docs");

  // Get all doc pages
  const { documents } = await listDocuments({ type: "doc", status: "published" });

  // Sort docs alphabetically, but keep overview first
  const sortedDocs = documents
    .filter((d) => d.document.slug !== "docs")
    .sort((a, b) => a.document.title.localeCompare(b.document.title));

  return (
    <PublicLayout currentSlug="docs">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="grid gap-12 lg:grid-cols-4">
          {/* Sidebar */}
          <aside className="lg:col-span-1">
            <nav className="sticky top-24 space-y-1">
              <h3 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-white">
                Documentation
              </h3>
              <Link
                href="/docs"
                className="block rounded-md bg-zinc-100 px-3 py-2 text-sm font-medium text-zinc-900 dark:bg-zinc-800 dark:text-white"
              >
                Overview
              </Link>
              {sortedDocs.map((doc) => (
                <Link
                  key={doc.document.id}
                  href={`/${doc.document.slug}`}
                  className="block rounded-md px-3 py-2 text-sm text-zinc-600 transition-colors hover:bg-zinc-50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-white"
                >
                  {doc.document.title}
                </Link>
              ))}
            </nav>
          </aside>

          {/* Content */}
          <main className="lg:col-span-3">
            <header className="mb-8">
              <h1 className="text-4xl font-bold tracking-tight text-zinc-900 dark:text-white">
                Documentation
              </h1>
              <p className="mt-2 text-lg text-zinc-600 dark:text-zinc-400">
                Learn how to use Vercel KV2
              </p>
            </header>

            {overview && (
              <div className="prose max-w-none prose-headings:font-semibold prose-headings:tracking-tight prose-h2:text-2xl prose-h3:text-xl prose-p:leading-relaxed prose-li:my-0">
                <Markdown content={overview.document.body} />
              </div>
            )}

            {/* Doc cards */}
            <div className="mt-12 grid gap-4 sm:grid-cols-2">
              {sortedDocs.map((doc) => (
                <Link
                  key={doc.document.id}
                  href={`/${doc.document.slug}`}
                  className="group rounded-lg border border-zinc-200 bg-white p-5 transition-all hover:border-zinc-300 hover:shadow-sm dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
                >
                  <h3 className="font-semibold text-zinc-900 group-hover:text-blue-600 dark:text-white dark:group-hover:text-blue-400">
                    {doc.document.title}
                  </h3>
                  <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                    {doc.document.body.slice(0, 100).replace(/[#*`\n]/g, " ").trim()}...
                  </p>
                </Link>
              ))}
            </div>
          </main>
        </div>
      </div>
    </PublicLayout>
  );
}
