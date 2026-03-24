import { Suspense } from "react";
import EventsClient from "@/components/EventsClient";
import { getCachedEventsPage } from "@/lib/events-cache";

async function EventsList() {
  const { events, nextCursor } = await getCachedEventsPage();
  return <EventsClient initialEvents={events} initialCursor={nextCursor} />;
}

export default function EventsPage() {
  return (
    <Suspense fallback={null}>
      <EventsList />
    </Suspense>
  );
}
