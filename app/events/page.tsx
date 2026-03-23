import { Suspense } from "react";
import { listEvents } from "@/lib/kv";
import EventsClient from "@/components/EventsClient";

async function EventsList() {
  const { events, nextCursor } = await listEvents();
  return <EventsClient initialEvents={events} initialCursor={nextCursor} />;
}

export default function EventsPage() {
  return (
    <Suspense>
      <EventsList />
    </Suspense>
  );
}
