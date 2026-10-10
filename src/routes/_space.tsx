import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { BookOpen, CalendarDays, Heart, Settings, Sun, WifiOff } from "lucide-react";
import { SpaceProvider, loadSpace, useSpace } from "@/lib/space";
import { supabase } from "@/integrations/supabase/client";
import { readSession, clearSession } from "@/lib/session";

export const Route = createFileRoute("/_space")({
  ssr: false,
  component: SpaceLayout,
  loader: async () => {
    const session = readSession();
    if (!session) return null;
    const { data } = await supabase.auth.getUser();
    if (!data.user) return null;
    try {
      return await loadSpace(data.user.id);
    } catch {
      return null;
    }
  },
});

const NAV = [
  { to: "/today",    label: "Today",    icon: Sun },
  { to: "/together", label: "Together", icon: Heart },
  { to: "/diary",    label: "Diary",    icon: BookOpen },
  { to: "/week",     label: "Week",     icon: CalendarDays },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

function SpaceLayout() {
  const data = Route.useLoaderData();
  const navigate = useNavigate();

  useEffect(() => {
    if (!data) {
      void clearSession().finally(() => navigate({ to: "/", replace: true }));
    }
  }, [data, navigate]);

  if (!data) return null;
  return (
    <SpaceProvider initial={data}>
      <InnerLayout />
    </SpaceProvider>
  );
}

function InnerLayout() {
  const { online } = useSpace();
  const state = useRouterState();
  const active = state.location.pathname;

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background text-foreground">
      {!online && (
        <div className="flex items-center justify-center gap-2 bg-destructive/10 px-4 py-2 text-xs text-destructive">
          <WifiOff className="size-3.5" /> Offline — changes will sync when you reconnect
        </div>
      )}
      <main className="flex-1 overflow-y-auto pb-24">
        <Outlet />
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background/80 backdrop-blur-md"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
        <div className="mx-auto grid max-w-lg grid-cols-5">
          {NAV.map(({ to, label, icon: Icon }) => {
            const isActive = active === to || active.startsWith(to + "/");
            return (
              <Link key={to} to={to}
                className={`flex flex-col items-center gap-1 py-3 text-[11px] font-medium transition-colors ${
                  isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
                }`}>
                <Icon className="size-5" strokeWidth={isActive ? 2.5 : 1.8} />
                {label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
