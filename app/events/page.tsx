import { Suspense } from "react";
import { cookies, headers } from "next/headers";
import EventsClient from "@/components/EventsClient";
import { validateUserAuthValues } from "@/lib/auth";
import { listEvents } from "@/lib/kv";

async function EventsList() {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  const { events, nextCursor } = await listEvents();
  const canManage = validateUserAuthValues(
    cookieStore.get("gecko_session")?.value,
    headerStore.get("authorization")
  );
  return <EventsClient initialEvents={events} initialCursor={nextCursor} canManage={canManage} />;
}

export default function EventsPage() {
  return (
    <Suspense fallback={null}>
      <EventsList />
    </Suspense>
  );
}
