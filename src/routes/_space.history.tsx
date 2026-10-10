import { createFileRoute } from "@tanstack/react-router";
import { WeekAndHistory } from "./_space.week";

export const Route = createFileRoute("/_space/history")({
  head: () => ({
    meta: [
      { title: "History & Week — Us" },
      { name: "description", content: "Your last 30 days and weekly trends at a glance." },
    ],
  }),
  component: WeekAndHistory,
});
