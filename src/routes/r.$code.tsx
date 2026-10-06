import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Btn, Field, TextInput } from "@/components/us/primitives";
import { getRoomPreview, joinRoom, rejoinRoom } from "@/lib/room.functions";
import { ensureIdentity, friendlyError, readSession, writeSession } from "@/lib/session";

export const Route = createFileRoute("/r/$code")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "You've been invited — Us" },
      { name: "description", content: "Someone invited you into your shared space." },
      { property: "og:title", content: "You've been invited into your shared space ❤️" },
      { property: "og:description", content: "Tap to join — eat better together, one meal at a time." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Join,
});

type Preview = Awaited<ReturnType<typeof getRoomPreview>>;

function Join() {
  const { code } = Route.useParams();
  const navigate = useNavigate();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [rejoin, setRejoin] = useState(false);
  const [key, setKey] = useState("");

  useEffect(() => {
    const s = readSession();
    if (s) {
      void navigate({ to: "/today", replace: true });
      return;
    }
    getRoomPreview({ data: { code } })
      .then(setPreview)
      .catch(() => setLoadError(true));
  }, [code, navigate]);

  async function join(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await ensureIdentity();
      const r = await joinRoom({ data: { code, name: name.trim() } });
      writeSession(r);
      void navigate({ to: "/today", replace: true });
    } catch (err) {
      toast.error(friendlyError(err));
      if (String(err).includes("ROOM_FULL")) setPreview((p) => (p && p.status !== "invalid" && p.status !== "not_found" ? { ...p, status: "full" } : p));
    } finally {
      setBusy(false);
    }
  }

  async function doRejoin(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await ensureIdentity();
      const r = await rejoinRoom({ data: { code, key: key.trim() } });
      writeSession(r);
      toast.success("Welcome back ❤️");
      void navigate({ to: "/today", replace: true });
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  const shell = (children: React.ReactNode) => (
    <main className="flex min-h-[100dvh] flex-col justify-center bg-background px-6 py-12">
      <div className="mx-auto w-full max-w-md animate-arrive">{children}</div>
    </main>
  );

  if (loadError)
    return shell(
      <>
        <h1 className="text-3xl text-foreground">We can't reach your space right now</h1>
        <p className="mt-3 text-muted-foreground">Check your connection and try again.</p>
        <Btn className="mt-6" onClick={() => location.reload()}>Try again</Btn>
      </>,
    );
  if (!preview) return shell(<div className="text-muted-foreground">Opening your invite…</div>);
  if (preview.status === "invalid" || preview.status === "not_found")
    return shell(
      <>
        <h1 className="text-3xl text-foreground">
          {preview.status === "invalid" ? "That code doesn't look right" : "We couldn't find that space"}
        </h1>
        <p className="mt-3 text-muted-foreground">Double-check the invite link or code with your partner.</p>
        <Link to="/" className="mt-6 inline-block text-primary underline-offset-4 hover:underline">
          Start over
        </Link>
      </>,
    );

  const rejoinForm = (
    <form onSubmit={doRejoin} className="mt-8 space-y-4">
      <Field label="Your personal key" hint="You'll find it in Settings on your old phone.">
        <TextInput value={key} onChange={(e) => setKey(e.target.value)} placeholder="64-character key" className="font-mono text-sm" autoCapitalize="off" autoCorrect="off" spellCheck={false} />
      </Field>
      <Btn size="lg" className="w-full" disabled={!key.trim() || busy}>
        {busy ? "Checking…" : "Rejoin our space"}
      </Btn>
    </form>
  );

  if (preview.status === "full")
    return shell(
      <>
        <h1 className="text-3xl leading-tight text-foreground">This space already belongs to two people ❤️</h1>
        <p className="mt-3 text-muted-foreground">
          If you're one of them and you're on a new phone, use your personal key to step back in.
        </p>
        {rejoinForm}
      </>,
    );

  return shell(
    <>
      <div className="mb-8 text-sm tracking-wide text-muted-foreground">us.</div>
      <h1 className="text-[2.3rem] leading-[1.1] text-foreground">
        {preview.inviterName ?? "Someone"} invited you into your shared space ❤️
      </h1>
      {!rejoin ? (
        <>
          <form onSubmit={join} className="mt-10 space-y-6">
            <Field label="What's your name?">
              <TextInput autoFocus value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="Your name" autoComplete="given-name" />
            </Field>
            <Btn size="lg" className="w-full" disabled={!name.trim() || busy}>
              {busy ? "Joining…" : "Join us ❤️"}
            </Btn>
          </form>
          <button onClick={() => setRejoin(true)} className="mt-4 w-full py-2 text-sm text-muted-foreground hover:underline">
            Already joined before? Rejoin with your personal key
          </button>
        </>
      ) : (
        <>
          {rejoinForm}
          <button onClick={() => setRejoin(false)} className="mt-4 w-full py-2 text-sm text-muted-foreground hover:underline">Back</button>
        </>
      )}
    </>,
  );
}
