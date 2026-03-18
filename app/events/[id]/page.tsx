import { notFound } from "next/navigation";
import { getEvent } from "@/lib/kv";
import EventVideoView from "@/components/EventVideoView";

interface EventPageProps {
  params: Promise<{ id: string }>;
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
