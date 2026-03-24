import { Suspense } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { cacheTag } from "next/cache";
import { getEvent } from "@/lib/kv";
import EventVideoView from "@/components/EventVideoView";

interface EventPageProps {
  params: Promise<{ id: string }>;
}

async function getCachedEvent(id: string) {
  "use cache";
  cacheTag(`event-${id}`);
  cacheTag("events-list");
  return getEvent(id);
}

export async function generateMetadata({ params }: EventPageProps): Promise<Metadata> {
  const { id } = await params;
  const event = await getCachedEvent(id);
  if (!event) return { title: "Event not found — Gecko Cam" };

  const date = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(event.timestamp));

  return {
    title: `${date} — Gecko Cam`,
    description: `Motion event captured at ${date}${event.motionScore ? ` · score ${Math.round(event.motionScore)}` : ""}`,
  };
}

async function EventDetail({ params }: EventPageProps) {
  await connection();
  const { id } = await params;
  const event = await getEvent(id);
  if (!event) notFound();
  return <EventVideoView event={event} backHref="/events" backLabel="← All Events" />;
}

export default function EventPage({ params }: EventPageProps) {
  return (
    <Suspense>
      <EventDetail params={params} />
    </Suspense>
  );
}
