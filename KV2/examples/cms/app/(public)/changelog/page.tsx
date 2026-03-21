import Link from "next/link";
import { cacheTag, cacheLife } from "next/cache";
import { listDocuments } from "@/lib/documents";
import { Markdown } from "@/components/markdown";
import { PublicLayout } from "@/components/public-layout";
import { CACHE_TAGS } from "@/lib/cache";

export default async function ChangelogIndexPage() {
  "use cache";
  cacheLife("cms");

  // Tag for changelog type updates
  cacheTag(CACHE_TAGS.documentType("changelog"));

  // Get all changelog entries
  const { documents } = await listDocuments({ type: "changelog", status: "published" });

  // Sort by slug (version) descending - v1.1.0 before v1.0.0
  const sortedChangelogs = documents.sort((a, b) =>
    b.document.slug.localeCompare(a.document.slug)
  );

  return (
    <PublicLayout currentSlug="changelog">
      <main className="mx-auto max-w-4xl px-6 py-12">
        <header className="mb-12 text-center">
          <h1 className="text-4xl font-bold tracking-tight text-zinc-900 dark:text-white sm:text-5xl">
            Changelog
          </h1>
          <p className="mt-4 text-lg text-zinc-600 dark:text-zinc-400">
            All notable changes to Vercel KV2
          </p>
        </header>

        <div className="space-y-16">
          {sortedChangelogs.map((doc, index) => (
            <article
              key={doc.document.id}
              className="relative"
            >
              {/* Timeline connector */}
              {index < sortedChangelogs.length - 1 && (
                <div className="absolute left-[11px] top-10 h-full w-0.5 bg-zinc-200 dark:bg-zinc-800" />
              )}

              <div className="flex gap-6">
                {/* Timeline dot */}
                <div className="relative flex-shrink-0">
                  <div className="h-6 w-6 rounded-full border-4 border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900" />
                </div>

                {/* Content */}
                <div className="flex-1 pb-8">
                  <Link href={`/${doc.document.slug}`}>
                    <h2 className="text-2xl font-bold text-zinc-900 transition-colors hover:text-blue-600 dark:text-white dark:hover:text-blue-400">
                      {doc.document.title}
                    </h2>
                  </Link>
                  {doc.metadata.publishedAt && (
                    <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-500">
                      {new Date(doc.metadata.publishedAt).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                    </p>
                  )}
                  <div className="prose mt-4 max-w-none prose-headings:font-semibold prose-headings:tracking-tight prose-h2:text-xl prose-h3:text-lg prose-p:leading-relaxed prose-li:my-0">
                    <Markdown content={doc.document.body} />
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>

        {sortedChangelogs.length === 0 && (
          <p className="text-center text-zinc-500 dark:text-zinc-400">
            No changelog entries yet.
          </p>
        )}
      </main>
    </PublicLayout>
  );
}
