import { notFound } from "next/navigation";
import { Markdown } from "@/components/markdown";
import { PublicLayout } from "@/components/public-layout";
import { getPreviewData } from "@/lib/preview-store";
import { listDocuments } from "@/lib/documents";
import { PreviewClient } from "./preview-client";

interface PreviewPageProps {
  searchParams: Promise<{ id?: string }>;
}

export const dynamic = "force-dynamic";

export default async function PreviewPage({ searchParams }: PreviewPageProps) {
  const { id } = await searchParams;

  if (!id) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-100 dark:bg-zinc-900">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">No Preview Data</h1>
          <p className="mt-2 text-zinc-600 dark:text-zinc-400">Preview ID is required</p>
        </div>
      </div>
    );
  }

  const preview = await getPreviewData(id);

  if (!preview) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-100 dark:bg-zinc-900">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">Preview Expired</h1>
          <p className="mt-2 text-zinc-600 dark:text-zinc-400">This preview has expired or doesn't exist</p>
        </div>
      </div>
    );
  }

  const { title, body, type, slug } = preview;
  const isHomePage = slug === "home";
  const isDocPage = type === "doc";

  // Get sidebar docs if this is a doc page
  let sidebarDocs: Awaited<ReturnType<typeof listDocuments>>["documents"] = [];
  if (isDocPage) {
    const { documents } = await listDocuments({ type: "doc", status: "published" });
    sidebarDocs = documents
      .filter((d) => d.document.slug !== "docs")
      .sort((a, b) => a.document.title.localeCompare(b.document.title));
  }

  return (
    <>
      {/* Client component for handling refresh messages */}
      <PreviewClient />

      <PublicLayout currentSlug={slug}>
        {/* Preview banner */}
        <div className="bg-amber-500 px-4 py-2 text-center text-sm font-medium text-amber-950">
          Preview Mode — This is an unsaved preview of your document
        </div>

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
                    {title}
                  </h1>
                  <p className="mx-auto max-w-2xl text-xl text-zinc-600 dark:text-zinc-300">
                    A type-safe, cached key-value store built for the edge.
                    Powered by Vercel Blob with automatic caching and TypeScript
                    support.
                  </p>
                  <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
                    <span className="rounded-lg bg-black px-6 py-3 text-sm font-medium text-white dark:bg-white dark:text-black">
                      Get Started
                    </span>
                    <span className="rounded-lg border border-zinc-300 bg-white px-6 py-3 text-sm font-medium text-zinc-900 dark:border-zinc-700 dark:bg-transparent dark:text-zinc-100">
                      View Changelog
                    </span>
                  </div>
                </div>
              </div>
              <div className="mx-auto max-w-4xl px-6 py-16">
                <article className="prose mx-auto max-w-none prose-headings:font-semibold prose-headings:tracking-tight prose-h2:text-2xl prose-h3:text-xl prose-p:leading-relaxed prose-li:my-0">
                  <Markdown content={body} />
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
                    <span
                      className={`block rounded-md px-3 py-2 text-sm ${
                        slug === "docs"
                          ? "bg-zinc-100 font-medium text-zinc-900 dark:bg-zinc-800 dark:text-white"
                          : "text-zinc-600 dark:text-zinc-400"
                      }`}
                    >
                      Overview
                    </span>
                    {sidebarDocs.map((doc) => (
                      <span
                        key={doc.document.id}
                        className={`block rounded-md px-3 py-2 text-sm ${
                          slug === doc.document.slug
                            ? "bg-zinc-100 font-medium text-zinc-900 dark:bg-zinc-800 dark:text-white"
                            : "text-zinc-600 dark:text-zinc-400"
                        }`}
                      >
                        {doc.document.title}
                      </span>
                    ))}
                  </nav>
                </aside>

                {/* Content */}
                <article className="lg:col-span-3">
                  <header className="mb-8">
                    <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-white sm:text-4xl">
                      {title}
                    </h1>
                  </header>
                  <div className="prose max-w-none prose-headings:font-semibold prose-headings:tracking-tight prose-h2:text-2xl prose-h3:text-xl prose-p:leading-relaxed prose-li:my-0">
                    <Markdown content={body} />
                  </div>
                </article>
              </div>
            </div>
          ) : (
            // Regular article page
            <article className="mx-auto max-w-4xl px-6 py-16">
              <header className="mb-12">
                <div className="mb-4">
                  <span className="inline-block rounded-full bg-zinc-100 px-3 py-1 text-sm font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                    {type}
                  </span>
                </div>
                <h1 className="text-4xl font-bold tracking-tight text-zinc-900 dark:text-white sm:text-5xl">
                  {title}
                </h1>
              </header>
              <div className="prose max-w-none prose-headings:font-semibold prose-headings:tracking-tight prose-h2:text-2xl prose-h3:text-xl prose-p:leading-relaxed prose-li:my-0">
                <Markdown content={body} />
              </div>
            </article>
          )}
        </main>
      </PublicLayout>
    </>
  );
}
