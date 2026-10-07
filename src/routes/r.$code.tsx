import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Btn, Field, TextInput } from "@/components/us/primitives";
import { getRoomPreview, joinRoom, linkDevice, rejoinRoom } from "@/lib/room.functions";
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
  const [useKey, setUseKey] = useState(false);

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
      const v = key.trim();
      const r = useKey ? await rejoinRoom({ data: { code, key: v } }) : await linkDevice({ data: { code, linkCode: v.replace(/\D/g, "") } });
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
      {useKey ? (
        <Field label="Your personal key" hint="You'll find it in Settings on your other device.">
          <TextInput value={key} onChange={(e) => setKey(e.target.value)} placeholder="64-character key" className="font-mono text-sm" autoCapitalize="off" autoCorrect="off" spellCheck={false} />
        </Field>
      ) : (
        <Field label="6-digit device code" hint="On a phone that's already in this space: Settings → Add another device.">
          <TextInput value={key} onChange={(e) => setKey(e.target.value)} inputMode="numeric" maxLength={7} placeholder="123456" className="num text-2xl tracking-[0.3em]" autoComplete="one-time-code" />
        </Field>
      )}
      <Btn size="lg" className="w-full" disabled={!key.trim() || busy}>
        {busy ? "Checking…" : "Add this device ❤️"}
      </Btn>
      <button type="button" onClick={() => { setUseKey(!useKey); setKey(""); }} className="w-full py-2 text-sm text-muted-foreground hover:underline">
        {useKey ? "Use a 6-digit device code instead" : "Lost your other device? Use your personal key"}
      </button>
    </form>
  );

  if (preview.status === "full")
    return shell(
      <>
        <h1 className="text-3xl leading-tight text-foreground">This space already belongs to two people ❤️</h1>
        <p className="mt-3 text-muted-foreground">
          If you're one of them, add this device with a code from your other phone.
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
            Already in this space? Add this device
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
