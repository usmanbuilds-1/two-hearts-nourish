import { createFileRoute, Link, Outlet, useRouter, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { markMyDeviceActive } from "@/lib/devices.functions";
import { friendlyDeviceLabel } from "@/lib/device-label";
import { BookOpen, CalendarDays, Heart, Settings, Sun, WifiOff } from "lucide-react";
import { SpaceProvider, useSpace } from "@/lib/space";
import { loadSpaceEntry } from "@/lib/space-entry";

export const Route = createFileRoute("/_space")({
  ssr: false,
  component: SpaceLayout,
  loader: loadSpaceEntry,
});

const NAV = [
  { to: "/today",    label: "Today",    icon: Sun },
  { to: "/together", label: "Together", icon: Heart },
  { to: "/diary",    label: "Diary",    icon: BookOpen },
  { to: "/week",     label: "Week",     icon: CalendarDays },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

type FailedEntry = Exclude<Awaited<ReturnType<typeof loadSpaceEntry>>, { kind: "ready" }>;

function ReconnectScreen({ entry }: { entry: FailedEntry }) {
  const router = useRouter();
  const needsReconnect = entry.kind === "retry";
  const savedCode = entry.kind !== "new" ? entry.roomCode : null;

  useEffect(() => {
    if (!needsReconnect) return;
    const retry = () => { void router.invalidate(); };
    const whenVisible = () => {
      if (document.visibilityState === "visible") retry();
    };
    window.addEventListener("online", retry);
    document.addEventListener("visibilitychange", whenVisible);
    return () => {
      window.removeEventListener("online", retry);
      document.removeEventListener("visibilitychange", whenVisible);
    };
  }, [needsReconnect, router]);

  const heading = needsReconnect
    ? "Reconnecting to our space"
    : entry.kind === "recover" ? "Let's get you back in" : "Welcome to your space";
  const description = needsReconnect
    ? "Your connection isn't ready yet. Nothing has been signed out or erased. Please try again."
    : entry.kind === "recover"
      ? "This phone needs to reconnect securely. Your shared meals are still on the server. Use your personal key or ask your partner to open Settings → Come back to us and send you a private link."
      : "This browser doesn't have a saved connection yet. Use your invitation to join or create a space.";

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-background px-6 py-12 text-foreground">
      <div className="w-full max-w-md">
        <div className="mb-4 text-sm tracking-wide text-muted-foreground">us.</div>
        <h1 className="font-display text-3xl leading-tight">{heading}</h1>
        <p className="mt-3 leading-relaxed text-muted-foreground">{description}</p>
        {needsReconnect && (
          <button type="button" onClick={() => void router.invalidate()}
            className="mt-7 inline-flex min-h-12 w-full items-center justify-center rounded-full bg-primary px-6 font-medium text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
            Try again
          </button>
        )}
        {savedCode ? (
          <Link to="/r/$code" params={{ code: savedCode }}
            className="mt-3 inline-flex min-h-12 w-full items-center justify-center rounded-full border border-input px-5 font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
            Rejoin with a personal key or device link
          </Link>
        ) : (
          <Link to="/" className="mt-7 inline-flex min-h-12 w-full items-center justify-center rounded-full bg-primary px-5 text-primary-foreground">
            Open invitations
          </Link>
        )}
      </div>
    </main>
  );
}

function SpaceLayout() {
  const entry = Route.useLoaderData();
  if (entry.kind !== "ready") return <ReconnectScreen entry={entry} />;
  return (
    <SpaceProvider initial={entry.space}>
      <InnerLayout />
    </SpaceProvider>
  );
}

function InnerLayout() {
  const { online, me } = useSpace();

  // One lightweight authenticated heartbeat at entry and after a day away.
  // This makes device history reflect real app access, not just Settings visits.
  useEffect(()=>{
    let lastSent=0;
    const ping=()=>{
      if(Date.now()-lastSent<20*60_000)return;
      const key="us.device.last-active."+me.id;
      try{
        const previous=Number(localStorage.getItem(key)??0);
        if(Date.now()-previous<20*60_000)return;
      }catch{ /* Private browsing can disable localStorage. */ }
      lastSent=Date.now();
      void markMyDeviceActive({data:{deviceLabel:friendlyDeviceLabel(navigator.userAgent)}})
        .then(result=>{
          if(result.ok)try{localStorage.setItem(key,String(Date.now()));}catch{ /* optional */ }
        }).catch(()=>{});
    };
    ping();
    const onVisible=()=>{if(document.visibilityState==="visible")ping();};
    document.addEventListener("visibilitychange",onVisible);
    return()=>document.removeEventListener("visibilitychange",onVisible);
  },[me.id]);
  const state = useRouterState();
  const active = state.location.pathname;

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background text-foreground">
      {!online && (
        <div className="flex items-center justify-center gap-2 bg-destructive/10 px-4 py-2 text-xs text-destructive">
          <WifiOff className="size-3.5" /> Offline — saved changes require a connection. Reopen to refresh after reconnecting.
        </div>
      )}
      <main className="flex-1 overflow-y-auto pb-24">
        <Outlet />
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-card/95"
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
