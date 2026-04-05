import { Suspense } from "react";
import { cookies } from "next/headers";
import EventsClient from "@/components/EventsClient";
import { validateSessionToken } from "@/lib/auth";
import { listEvents } from "@/lib/kv";

export const dynamic = "force-dynamic";

async function EventsList() {
  const { events, nextCursor } = await listEvents();
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
