import { Suspense } from "react";
import { cookies } from "next/headers";
import EventsClient from "@/components/EventsClient";
import { validateSessionToken } from "@/lib/auth";
import { listFavoriteEvents } from "@/lib/kv";

async function FavoritesList() {
  const cookieStore = await cookies();
  const { events: favorites, missingCount } = await listFavoriteEvents();
  const canManage = validateSessionToken(cookieStore.get("gecko_session")?.value);
  const emptyTitle = missingCount > 0
    ? `${missingCount} saved favorite clip${missingCount === 1 ? "" : "s"} expired`
    : "No favorite clips yet.";
  const emptyBody = missingCount > 0
    ? "Those favorites are older than the retained event history, so the app no longer has their clip metadata. New favorites will now be preserved."
    : "Star the clips you want to keep handy, and they will show up here.";

  return (
    <EventsClient
      initialEvents={favorites}
      initialCursor={null}
      canManage={canManage}
      favoritesOnly
      title="Favorite Clips"
      emptyTitle={emptyTitle}
      emptyBody={emptyBody}
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
