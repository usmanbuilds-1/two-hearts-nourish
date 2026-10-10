import { createFileRoute } from "@tanstack/react-router";
import { WeekAndHistory } from "./_space.week";

/** Analytics is now the Stats tab inside the Week screen. */
export const Route = createFileRoute("/_space/analytics")({
  head: () => ({ meta: [{ title: "Stats — Us" }] }),
  component: WeekAndHistory,
});
