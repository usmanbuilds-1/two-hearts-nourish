import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CalendarDays, CalendarRange, Heart, Settings, Sun, WifiOff } from "lucide-react";
import { SpaceProvider, loadSpace, useSpace } from "@/lib/space";
import { clearSession, ensureIdentity, friendlyError, readSession, writeSession } from "@/lib/session";
import { rejoinRoom } from "@/lib/room.functions";
import { Btn } from "@/components/us/primitives";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_space")({
  ssr: false,
  component: SpaceLayout,
});

type Loaded = NonNullable<Awaited<ReturnType<typeof loadSpace>>>;

function SpaceLayout() {
  const navigate = useNavigate();
  const [state, setState] = useState<{ kind: "loading" } | { kind: "error"; msg: string } | { kind: "ready"; data: Loaded }>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const local = readSession();
      if (!local) {
        void navigate({ to: "/", replace: true });
        return;
      }
      try {
        const uid = await ensureIdentity();
        let data = await loadSpace(uid);
        if (!data) {
          try {
            if (!local.key) throw new Error("NO_KEY");
            const r = await rejoinRoom({ data: { code: local.roomCode, key: local.key } });
            writeSession(r);
            data = await loadSpace(uid);
          } catch {
            data = null;
          }
        }
        if (cancelled) return;
        if (!data) {
          await clearSession();
          void navigate({ to: "/r/$code", params: { code: local.roomCode }, replace: true });
          return;
        }
        setState({ kind: "ready", data });
      } catch (e) {
        if (!cancelled) setState({ kind: "error", msg: friendlyError(e) });
      }
    })();
    return () => { cancelled = true; };
  }, [navigate, attempt]);

  if (state.kind === "loading")
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-background">
        <div className="animate-pulse font-display text-2xl text-muted-foreground">us.</div>
      </div>
    );
  if (state.kind === "error")
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <h1 className="text-2xl text-foreground">We can't reach your space</h1>
        <p className="max-w-sm text-muted-foreground">{state.msg}</p>
        <Btn onClick={() => { setState({ kind: "loading" }); setAttempt((a) => a + 1); }}>Try again</Btn>
      </div>
    );

  return (
    <SpaceProvider initial={state.data}>
      <Shell />
    </SpaceProvider>
  );
}

const NAV = [
  { to: "/today", label: "Today", icon: Sun },
  { to: "/together", label: "Together", icon: Heart },
  { to: "/week", label: "Week", icon: CalendarDays },
  { to: "/history", label: "History", icon: CalendarRange },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

function Shell() {
  const { online, me, partner, room } = useSpace();
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div className="min-h-[100dvh] bg-background text-foreground md:flex">
      <aside className="sticky top-0 hidden h-[100dvh] w-60 shrink-0 flex-col border-r border-border px-5 py-8 md:flex">
        <div className="font-display text-2xl">us.</div>
        <div className="mt-1 text-sm text-muted-foreground">
          {me.display_name} + {partner?.display_name ?? "…"}
        </div>
        <nav className="mt-10 space-y-1">
          {NAV.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
                path === n.to ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <n.icon className="size-4" />
              {n.label}
            </Link>
          ))}
        </nav>
        {room.couple_message && (
          <p className="mt-auto font-display text-sm italic leading-relaxed text-muted-foreground">"{room.couple_message}"</p>
        )}
      </aside>

      <div className="min-w-0 flex-1">
        {!online && (
          <div className="sticky top-0 z-30 flex items-center justify-center gap-2 bg-secondary px-4 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] text-sm text-secondary-foreground">
            <WifiOff className="size-4" /> You're offline. We'll reconnect when you're back.
          </div>
        )}
        <Outlet />
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        <div className="mx-auto grid max-w-xl grid-cols-5">
          {NAV.map((n) => {
            const active = path === n.to;
            return (
              <Link key={n.to} to={n.to} className={cn("flex min-h-[60px] flex-col items-center justify-center gap-1 text-[10px]", active ? "text-primary" : "text-muted-foreground")}>
                <n.icon className="size-5" strokeWidth={active ? 2.2 : 1.7} />
                {n.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
