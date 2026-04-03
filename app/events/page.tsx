import { Suspense } from "react";
import { cookies } from "next/headers";
import EventsClient from "@/components/EventsClient";
import { getCachedEventsPage } from "@/lib/events-cache";
import { validateSessionToken } from "@/lib/auth";

async function EventsList() {
  const { events, nextCursor } = await getCachedEventsPage();
  const cookieStore = await cookies();
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
