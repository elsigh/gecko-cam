import { notFound } from "next/navigation";
import Link from "next/link";
import { cacheTag, cacheLife } from "next/cache";
import { Markdown } from "@/components/markdown";
import { PublicLayout } from "@/components/public-layout";
import {
  getDocumentBySlug,
  getDocumentByUrl,
  listDocuments,
} from "@/lib/documents";
import { CACHE_TAGS } from "@/lib/cache";

interface PageProps {
  params: Promise<{ slug: string[] }>;
}

export async function generateStaticParams() {
  const { documents } = await listDocuments({ status: "published" });

  const params: { slug: string[] }[] = [];

  for (const doc of documents) {
    // Skip docs and changelog index pages (they have their own routes)
    if (doc.document.slug === "docs" || doc.document.slug === "changelog") {
      continue;
    }

    // Add the main slug
    params.push({ slug: doc.document.slug.split("/") });

    // Add URL aliases
    for (const url of doc.document.urls) {
      const urlPath = url.startsWith("/") ? url.slice(1) : url;
      if (urlPath && urlPath !== doc.document.slug) {
        params.push({ slug: urlPath.split("/") });
      }
    }
  }

  return params;
}

export default async function PublicPage({ params }: PageProps) {
  "use cache";
  cacheLife("cms");

  const { slug } = await params;
  const slugPath = slug.join("/");
  const urlPath = "/" + slugPath;

  // Tag this page for cache invalidation
  cacheTag(CACHE_TAGS.documentSlug(slugPath));

  // Try slug first, then URL alias
  let result = await getDocumentBySlug(slugPath);

  if (!result) {
    result = await getDocumentByUrl(urlPath);
  }

  if (!result || result.document.status !== "published") {
    notFound();
  }

  const { document, metadata } = result;

  // Also tag by the actual document slug (in case accessed via URL alias)
  if (document.slug !== slugPath) {
    cacheTag(CACHE_TAGS.documentSlug(document.slug));
  }
  cacheTag(CACHE_TAGS.documentId(document.type, document.id));

  const isHomePage = document.slug === "home";
  const isDocPage = document.type === "doc";

  // Get sidebar docs if this is a doc page
  let sidebarDocs: Awaited<ReturnType<typeof listDocuments>>["documents"] = [];
  if (isDocPage) {
    // Tag for doc type list updates
    cacheTag(CACHE_TAGS.documentType("doc"));
    const { documents } = await listDocuments({ type: "doc", status: "published" });
    sidebarDocs = documents
      .filter((d) => d.document.slug !== "docs")
      .sort((a, b) => a.document.title.localeCompare(b.document.title));
  }

  return (
    <PublicLayout currentSlug={document.slug}>
      <main>
        {isHomePage ? (
          // Hero section for homepage
          <div>
            <div className="border-b border-zinc-200 bg-gradient-to-b from-zinc-50 to-white dark:border-zinc-800 dark:from-zinc-900 dark:to-black">
              <div className="mx-auto max-w-6xl px-6 py-24 text-center">
                <div className="mb-6 inline-flex items-center rounded-full border border-zinc-200 bg-white px-4 py-1.5 text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                  <span className="mr-2 inline-block h-2 w-2 rounded-full bg-green-500" />
                  Now available in preview
                </div>
                <h1 className="mb-6 text-5xl font-bold tracking-tight text-zinc-900 dark:text-white sm:text-6xl lg:text-7xl">
                  {document.title}
                </h1>
                <p className="mx-auto max-w-2xl text-xl text-zinc-600 dark:text-zinc-300">
                  A type-safe, cached key-value store built for the edge.
                  Powered by Vercel Blob with automatic caching and TypeScript
                  support.
                </p>
                <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
                  <Link
                    href="/docs"
                    className="rounded-lg bg-black px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
                  >
                    Get Started
                  </Link>
                  <Link
                    href="/changelog"
                    className="rounded-lg border border-zinc-300 bg-white px-6 py-3 text-sm font-medium text-zinc-900 transition-colors hover:border-zinc-400 dark:border-zinc-700 dark:bg-transparent dark:text-zinc-100 dark:hover:border-zinc-600"
                  >
                    View Changelog
                  </Link>
                </div>
              </div>
            </div>
            <div className="mx-auto max-w-4xl px-6 py-16">
              <article className="prose mx-auto max-w-none prose-headings:font-semibold prose-headings:tracking-tight prose-h2:text-2xl prose-h3:text-xl prose-p:leading-relaxed prose-li:my-0">
                <Markdown content={document.body} />
              </article>
            </div>
          </div>
        ) : isDocPage ? (
          // Doc page with sidebar
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
                    className={`block rounded-md px-3 py-2 text-sm ${
                      document.slug === "docs"
                        ? "bg-zinc-100 font-medium text-zinc-900 dark:bg-zinc-800 dark:text-white"
                        : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-white"
                    }`}
                  >
                    Overview
                  </Link>
                  {sidebarDocs.map((doc) => (
                    <Link
                      key={doc.document.id}
                      href={`/${doc.document.slug}`}
                      className={`block rounded-md px-3 py-2 text-sm transition-colors ${
                        document.slug === doc.document.slug
                          ? "bg-zinc-100 font-medium text-zinc-900 dark:bg-zinc-800 dark:text-white"
                          : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-white"
                      }`}
                    >
                      {doc.document.title}
                    </Link>
                  ))}
                </nav>
              </aside>

              {/* Content */}
              <article className="lg:col-span-3">
                <header className="mb-8">
                  <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-white sm:text-4xl">
                    {document.title}
                  </h1>
                </header>
                <div className="prose max-w-none prose-headings:font-semibold prose-headings:tracking-tight prose-h2:text-2xl prose-h3:text-xl prose-p:leading-relaxed prose-li:my-0">
                  <Markdown content={document.body} />
                </div>
              </article>
            </div>
          </div>
        ) : (
          // Regular article page
          <article className="mx-auto max-w-4xl px-6 py-16">
            <header className="mb-12">
              <h1 className="text-4xl font-bold tracking-tight text-zinc-900 dark:text-white sm:text-5xl">
                {document.title}
              </h1>
              {metadata.publishedAt && (
                <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">
                  Last updated{" "}
                  {new Date(metadata.publishedAt).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </p>
              )}
            </header>
            <div className="prose max-w-none prose-headings:font-semibold prose-headings:tracking-tight prose-h2:text-2xl prose-h3:text-xl prose-p:leading-relaxed prose-li:my-0">
              <Markdown content={document.body} />
            </div>
          </article>
        )}
      </main>
    </PublicLayout>
  );
}
