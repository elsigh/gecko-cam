import { Suspense } from "react";
import { cookies } from "next/headers";
import EventsClient from "@/components/EventsClient";
import { validateSessionToken } from "@/lib/auth";
import { listEvents } from "@/lib/kv";

async function EventsList() {
  const cookieStore = await cookies();
  const { events, nextCursor } = await listEvents();
  const canManage = validateSessionToken(cookieStore.get("gecko_session")?.value);
  return <EventsClient initialEvents={events} initialCursor={nextCursor} canManage={canManage} />;
}

export default function EventsPage() {
  return (
    <Suspense fallback={null}>
      <EventsList />
    </Suspense>
  );
}
