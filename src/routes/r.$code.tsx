import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Btn, Field, TextInput } from "@/components/us/primitives";
import { getRoomPreview, joinRoom, linkDevice, rejoinRoom } from "@/lib/room.functions";
import { ensureIdentity, friendlyError, writeSession } from "@/lib/session";
import { readRejoinToken } from "@/lib/rejoin-links";
import { friendlyDeviceLabel } from "@/lib/device-label";

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
  const [ignoreMagicLink, setIgnoreMagicLink] = useState(false);

  // Only long random one-use links from the URL fragment are valid.
  const lc = typeof window !== "undefined"
    ? readRejoinToken(window.location.search, window.location.hash)
    : null;

  useEffect(() => {
    // A stale local marker must not trap recovery in a /today redirect loop.
    let mounted = true;
    setPreview(null);
    setLoadError(false);
    getRoomPreview({ data: { code } })
      .then((result) => { if (mounted) setPreview(result); })
      .catch(() => { if (mounted) setLoadError(true); });
    return () => { mounted = false; };
  }, [code]);

  async function join(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await ensureIdentity();
      const r = await joinRoom({ data: { code, name: name.trim(), deviceLabel: friendlyDeviceLabel(navigator.userAgent) } });
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
      const r = await rejoinRoom({ data: { code, key: v, deviceLabel: friendlyDeviceLabel(navigator.userAgent) } });
      writeSession(r);
      toast.success("Welcome back ❤️");
      void navigate({ to: "/today", replace: true });
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  // ── Magic link: one-tap rejoin ────────────────────────────────────────
  if (lc && !ignoreMagicLink) {
    async function magicRejoin() {
      setBusy(true);
      try {
        await ensureIdentity();
        const r = await linkDevice({ data: { code, linkCode: lc!, deviceLabel: friendlyDeviceLabel(navigator.userAgent) } });
        writeSession(r);
        toast.success("Welcome back ❤️");
        void navigate({ to: "/today", replace: true });
      } catch (err) {
        const msg = String(err);
        if (msg.includes("EXPIRED") || msg.includes("INVALID") || msg.includes("NOT_FOUND")) {
          toast.error("This link has expired — ask your partner to send a new one.");
        } else {
          toast.error(friendlyError(err));
        }
        setBusy(false);
      }
    }
    return (
      <main className="flex min-h-[100dvh] flex-col items-center justify-center bg-background px-6 py-12">
        <div className="mx-auto w-full max-w-md animate-arrive text-center">
          <div className="text-6xl mb-6">💕</div>
          <h1 className="text-[2.2rem] leading-tight text-foreground">Welcome back!</h1>
          <p className="mt-3 text-lg text-muted-foreground">
            This private link reconnects your existing profile and meals. Open it in the browser where you want to stay signed in.
          </p>
          <Btn size="lg" className="mt-10 w-full" disabled={busy} onClick={magicRejoin}>
            {busy ? "Rejoining…" : "Rejoin our space ❤️"}
          </Btn>
          <p className="mt-4 text-xs text-muted-foreground">
            One-use link · ask your partner for a fresh one if it has expired
          </p>
          <Btn variant="outline" className="mt-5 w-full" onClick={() => {
            window.history.replaceState(window.history.state, "", window.location.pathname);
            setIgnoreMagicLink(true);
            setRejoin(true);
          }}>Use my personal recovery key instead</Btn>
        </div>
      </main>
    );
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
      <Field label="Your private recovery key" hint="A 64-character key stored privately on your device. If you lost it, ask your partner for a new recovery link from Settings.">
        <TextInput value={key} onChange={(e) => setKey(e.target.value.trim())} placeholder="64-character recovery key" className="font-mono text-sm" autoCapitalize="off" autoCorrect="off" spellCheck={false} autoComplete="off" />
      </Field>
      <Btn size="lg" className="w-full" disabled={!/^[a-f0-9]{64}$/i.test(key.trim()) || busy}>
        {busy ? "Checking…" : "Add this device ❤️"}
      </Btn>

    </form>
  );

  if (preview.status === "full")
    return shell(
      <>
        <h1 className="font-display text-3xl leading-tight">Welcome back.</h1>
        <p className="mt-3 text-muted-foreground">
          This space already has two people. To return to your existing meals, ask your partner for a private reconnect link from Settings → Come back to us. Open that link on this phone to sign in.
        </p>
        {!rejoin ? (
          <Btn variant="outline" className="mt-7 w-full" onClick={() => setRejoin(true)}>
            Use my saved recovery key instead
          </Btn>
        ) : (
          <>
            <p className="mt-5 text-xs text-muted-foreground">
              A device-specific key may transfer that saved sign-in to this browser. To add another independent device, use a new private reconnect link.
            </p>
            {rejoinForm}
          </>
        )}
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
