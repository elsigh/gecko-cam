import { ViewTransition } from "react";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import SnoozeButton from "@/components/SnoozeButton";
import TransitionLink from "@/components/TransitionLink";
import { getAppUrl } from "@/lib/site-url";
import {
  EVENT_DRILLDOWN_TRANSITION,
  EVENT_NEWER_TRANSITION,
  EVENT_OLDER_TRANSITION,
  EVENT_RETURN_TRANSITION,
  NAVIGATION_TRANSITION,
} from "@/lib/view-transitions";
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
          <TransitionLink
            href="/"
            transitionTypes={[NAVIGATION_TRANSITION]}
            className="flex shrink-0 items-center gap-2 text-gray-100 transition-colors hover:text-white sm:gap-3"
          >
            <span className="text-xl">🦎</span>
            <h1 className="text-base font-semibold tracking-tight sm:text-lg">
              <span className="sm:hidden">Cam</span>
              <span className="hidden sm:inline">Gecko Cam</span>
            </h1>
          </TransitionLink>
          <div className="ml-auto flex min-w-0 items-center gap-3 sm:gap-4">
            <TransitionLink
              href="/favorites"
              transitionTypes={[NAVIGATION_TRANSITION]}
              className="whitespace-nowrap text-xs text-gray-400 transition-colors hover:text-gray-200 sm:text-sm"
            >
              Favorites
            </TransitionLink>
            <TransitionLink
              href="/events"
              transitionTypes={[NAVIGATION_TRANSITION]}
              className="whitespace-nowrap text-xs text-gray-400 transition-colors hover:text-gray-200 sm:text-sm"
            >
              Events
            </TransitionLink>
            <TransitionLink
              href="/about"
              transitionTypes={[NAVIGATION_TRANSITION]}
              className="whitespace-nowrap text-xs text-gray-400 transition-colors hover:text-gray-200 sm:text-sm"
            >
              About
            </TransitionLink>
            <SnoozeButton />
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-3 py-6 sm:px-4">
          <ViewTransition
            default={{
              default: "vt-page-base",
              [NAVIGATION_TRANSITION]: "vt-page-nav",
              [EVENT_DRILLDOWN_TRANSITION]: "vt-page-drilldown",
              [EVENT_RETURN_TRANSITION]: "vt-page-return",
              [EVENT_NEWER_TRANSITION]: "vt-page-swipe-right",
              [EVENT_OLDER_TRANSITION]: "vt-page-swipe-left",
            }}
            enter="vt-page-enter"
            exit="vt-page-exit"
            update="vt-page-update"
          >
            <div className="min-h-[calc(100vh-5rem)]">{children}</div>
          </ViewTransition>
        </main>
      </body>
    </html>
  );
}
