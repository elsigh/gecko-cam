import { cookies } from "next/headers";
import EventsClient from "@/components/EventsClient";
import { validateUserAuthValues } from "@/lib/auth";
import { listEvents } from "@/lib/kv";

type EventsListProps = {
  includeSummaryEvents: boolean;
  title: string;
  emptyTitle?: string;
  emptyBody?: string;
  summaryToggleHref: string;
  summaryToggleLabel: string;
};

export default async function EventsList({
  includeSummaryEvents,
  title,
  emptyTitle,
  emptyBody,
  summaryToggleHref,
  summaryToggleLabel,
}: EventsListProps) {
  const cookieStore = await cookies();
  const { events, nextCursor } = await listEvents({ includeSummaryEvents });
  const canManage = validateUserAuthValues(cookieStore.get("gecko_session")?.value);

  return (
    <EventsClient
      initialEvents={events}
      initialCursor={nextCursor}
      canManage={canManage}
      title={title}
      emptyTitle={emptyTitle}
      emptyBody={emptyBody}
      includeSummaryEvents={includeSummaryEvents}
      summaryToggleHref={summaryToggleHref}
      summaryToggleLabel={summaryToggleLabel}
    />
  );
}
