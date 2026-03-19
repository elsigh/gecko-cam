import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getEvent } from "@/lib/kv";
import EventVideoView from "@/components/EventVideoView";

interface EventPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: EventPageProps): Promise<Metadata> {
  const { id } = await params;
  const event = await getEvent(id);
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

export default async function EventPage({ params }: EventPageProps) {
  const { id } = await params;
  const event = await getEvent(id);
  if (!event) notFound();

  return (
    <EventVideoView
      event={event}
      backHref="/events"
      backLabel="← All Events"
    />
  );
}
