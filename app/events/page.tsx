import { listEvents } from "@/lib/kv";
import EventsClient from "@/components/EventsClient";

export default async function EventsPage() {
  const { events, nextCursor } = await listEvents();
  return <EventsClient initialEvents={events} initialCursor={nextCursor} />;
}
