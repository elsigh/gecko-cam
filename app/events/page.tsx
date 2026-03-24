import { Suspense } from "react";
import { connection } from "next/server";
import { listEvents } from "@/lib/kv";
import EventsClient from "@/components/EventsClient";

async function EventsList() {
  await connection();
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
