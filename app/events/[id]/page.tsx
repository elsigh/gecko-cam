import { Suspense } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import EventVideoView from "@/components/EventVideoView";
import { getCachedEvent } from "@/lib/events-cache";
import { validateSessionToken } from "@/lib/auth";
import { formatEventTimestamp } from "@/lib/event-time";
import { getAppUrl } from "@/lib/site-url";

interface EventPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: EventPageProps): Promise<Metadata> {
  const { id } = await params;
  const event = await getCachedEvent(id);
  if (!event) return { title: "Event not found — Gecko Cam" };
  const eventUrl = `${getAppUrl()}/events/${id}`;
  const imageUrl = `${eventUrl}/opengraph-image`;

  const date = formatEventTimestamp(event.timestamp);

  return {
    title: `${date} — Gecko Cam`,
    description: `Motion event captured at ${date}${event.motionScore ? ` · score ${Math.round(event.motionScore)}` : ""}`,
    openGraph: {
      title: `${date} — Gecko Cam`,
      description: `Motion event captured at ${date}${event.motionScore ? ` · score ${Math.round(event.motionScore)}` : ""}`,
      url: eventUrl,
      images: [{ url: imageUrl, width: 1200, height: 630, alt: "Gecko Cam motion event" }],
    },
    twitter: {
      card: "summary_large_image",
      title: `${date} — Gecko Cam`,
      description: `Motion event captured at ${date}${event.motionScore ? ` · score ${Math.round(event.motionScore)}` : ""}`,
      images: [imageUrl],
    },
  };
}

async function EventDetail({ params }: EventPageProps) {
  const { id } = await params;
  const event = await getCachedEvent(id);
  const cookieStore = await cookies();
  const canDelete = validateSessionToken(cookieStore.get("gecko_session")?.value);
  if (!event) notFound();
  return <EventVideoView event={event} backHref="/events" backLabel="← All Events" canDelete={canDelete} />;
}

export default function EventPage({ params }: EventPageProps) {
  return (
    <Suspense fallback={null}>
      <EventDetail params={params} />
    </Suspense>
  );
}
