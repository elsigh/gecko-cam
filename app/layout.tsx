import type { Metadata } from "next";
import Link from "next/link";
import { Inter } from "next/font/google";
import SnoozeButton from "@/components/SnoozeButton";
import { getAppUrl } from "@/lib/site-url";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL(getAppUrl()),
  title: "Gecko Cam",
  description: "Live gecko vivarium webcam with motion-triggered event clips",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} bg-gray-900 text-gray-100 min-h-screen`}>
        <header className="flex items-center gap-3 border-b border-gray-800 px-3 py-3 sm:px-4">
          <Link
            href="/"
            className="flex shrink-0 items-center gap-2 text-gray-100 transition-colors hover:text-white sm:gap-3"
          >
            <span className="text-xl">🦎</span>
            <h1 className="text-base font-semibold tracking-tight sm:text-lg">
              <span className="sm:hidden">Cam</span>
              <span className="hidden sm:inline">Gecko Cam</span>
            </h1>
          </Link>
          <div className="ml-auto flex min-w-0 items-center gap-3 sm:gap-4">
            <Link
              href="/favorites"
              className="whitespace-nowrap text-xs text-gray-400 transition-colors hover:text-gray-200 sm:text-sm"
            >
              Favorites
            </Link>
            <Link
              href="/events"
              className="whitespace-nowrap text-xs text-gray-400 transition-colors hover:text-gray-200 sm:text-sm"
            >
              Events
            </Link>
            <Link
              href="/about"
              className="whitespace-nowrap text-xs text-gray-400 transition-colors hover:text-gray-200 sm:text-sm"
            >
              About
            </Link>
            <SnoozeButton />
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-3 py-6 sm:px-4">{children}</main>
      </body>
    </html>
  );
}
