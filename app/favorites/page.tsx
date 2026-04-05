import { Suspense } from "react";
import { cookies } from "next/headers";
import EventsClient from "@/components/EventsClient";
import { validateSessionToken } from "@/lib/auth";
import { listAllEvents } from "@/lib/kv";

async function FavoritesList() {
  const cookieStore = await cookies();
  const events = await listAllEvents();
  const favorites = events.filter((event) => event.favorite);
  const canManage = validateSessionToken(cookieStore.get("gecko_session")?.value);

  return (
    <EventsClient
      initialEvents={favorites}
      initialCursor={null}
      canManage={canManage}
      favoritesOnly
      title="Favorite Clips"
      emptyTitle="No favorite clips yet."
      emptyBody="Star the clips you want to keep handy, and they will show up here."
      backHref="/events"
      backLabel="← All Events"
    />
  );
}

export default function FavoritesPage() {
  return (
    <Suspense fallback={null}>
      <FavoritesList />
    </Suspense>
  );
}
