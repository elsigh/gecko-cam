import { Suspense } from "react";
import EventsList from "./EventsList";

export default function EventsPage() {
  return (
    <Suspense fallback={null}>
      <EventsList
        includeSummaryEvents={false}
        title="Event Clips"
        emptyTitle="No clips recorded yet."
        emptyBody="Saved video clips will appear automatically."
        summaryToggleHref="/events/all"
        summaryToggleLabel="Show summaries"
      />
    </Suspense>
  );
}
