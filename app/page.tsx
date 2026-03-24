import { Suspense } from "react";
import { connection } from "next/server";
import Link from "next/link";
import LiveStream from "@/components/LiveStream";
import StreamStatus from "@/components/StreamStatus";
import EventCard from "@/components/EventCard";
import { listEvents } from "@/lib/kv";

async function RecentEventsSidebar() {
  await connection();
  const { events } = await listEvents();
  const recent = events.slice(0, 6);

  return (
    <>
      {recent.length > 0 && (
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider">
            Recent Events
          </h2>
          <Link
            href="/events"
            className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
          >
            View all →
          </Link>
        </div>
      )}

      {recent.length === 0 ? (
        <>
          <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-3">
            Recent Events
          </h2>
          <div className="bg-gray-800 rounded-lg p-6 text-center">
            <p className="text-gray-500 text-sm">No motion events yet.</p>
            <p className="text-gray-600 text-xs mt-1">
              Events will appear here when motion is detected.
            </p>
          </div>
        </>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-3">
          {recent.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      )}
    </>
  );
}

export default function HomePage() {
  const streamUrl = process.env.NEXT_PUBLIC_STREAM_URL ?? "";

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      {/* Left: live stream */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider">
            Live
          </h2>
          {streamUrl && <StreamStatus streamUrl={streamUrl} />}
        </div>

        {streamUrl ? (
          <LiveStream streamUrl={streamUrl} />
        ) : (
          <div className="aspect-video bg-gray-800 rounded-lg flex items-center justify-center">
            <p className="text-gray-500 text-sm">
              Set <code className="bg-gray-700 px-1 rounded">NEXT_PUBLIC_STREAM_URL</code> to enable the live stream.
            </p>
          </div>
        )}
      </div>

      {/* Right: recent events sidebar */}
      <div className="lg:w-80 xl:w-96 shrink-0">
        <Suspense>
          <RecentEventsSidebar />
        </Suspense>
      </div>
    </div>
  );
}
