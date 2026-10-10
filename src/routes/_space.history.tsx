import { createFileRoute } from "@tanstack/react-router";
import { WeekAndHistory } from "./_space.week";

/** History is now a tab inside the Week screen. This route stays so bookmarks still work. */
export const Route = createFileRoute("/_space/history")({
  head: () => ({ meta: [{ title: "History — Us" }] }),
  component: WeekAndHistory,
});
