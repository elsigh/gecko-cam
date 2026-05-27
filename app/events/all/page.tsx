import { Suspense } from "react";
import EventsList from "../EventsList";

export default function AllEventsPage() {
  return (
    <Suspense fallback={null}>
      <EventsList
        includeSummaryEvents
        title="All Events"
        summaryToggleHref="/events"
        summaryToggleLabel="Hide summaries"
      />
    </Suspense>
  );
}
