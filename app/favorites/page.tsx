import { Suspense } from "react";
import { cookies } from "next/headers";
import EventsClient from "@/components/EventsClient";
import { getCachedFavoriteEvents } from "@/lib/events-cache";
import { validateSessionToken } from "@/lib/auth";

async function FavoritesList() {
  const [favorites, cookieStore] = await Promise.all([
    getCachedFavoriteEvents(),
    cookies(),
  ]);
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
