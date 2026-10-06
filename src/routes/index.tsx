import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, Copy } from "lucide-react";
import { Btn, Field, TextInput } from "@/components/us/primitives";
import { createRoom, normalizeCode } from "@/lib/room.functions";
import { ensureIdentity, friendlyError, inviteUrl, readSession, writeSession } from "@/lib/session";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Let's make this ours — Us" },
      { name: "description", content: "Create a private shared space for two to eat better and keep each other going." },
      { property: "og:title", content: "Let's make this ours — Us" },
      { property: "og:description", content: "A private shared space for two to eat better together." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Onboarding,
});

function Onboarding() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [codeMode, setCodeMode] = useState(false);
  const [code, setCode] = useState("");

  useEffect(() => {
    if (readSession()) void navigate({ to: "/today", replace: true });
  }, [navigate]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      await ensureIdentity();
      const r = await createRoom({ data: { name: name.trim() } });
      writeSession(r);
      setCreated(r.roomCode);
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(inviteUrl(created));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy — long-press the link to copy it instead.");
    }
  }

  async function share() {
    if (!created) return;
    if (navigator.share) {
      await navigator.share({ title: "Our space", text: "Join me in our little space ❤️", url: inviteUrl(created) }).catch(() => {});
    } else void copy();
  }

  return (
    <main className="flex min-h-[100dvh] flex-col justify-center bg-background px-6 py-12">
      <div className="mx-auto w-full max-w-md">
        {!created ? (
          <div className="animate-arrive">
            <div className="mb-10 text-sm tracking-wide text-muted-foreground">us.</div>
            <h1 className="text-[2.6rem] leading-[1.05] text-foreground">Let's make this ours ❤️</h1>
            <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
              A little space for the two of you to eat better, stay motivated, and keep each other going.
            </p>

            {!codeMode ? (
              <form onSubmit={create} className="mt-10 space-y-6">
                <Field label="What should we call you?">
                  <TextInput
                    autoFocus
                    value={name}
                    maxLength={40}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your name"
                    autoComplete="given-name"
                  />
                </Field>
                <div>
                  <div className="mb-3 text-sm text-muted-foreground">Create your shared space</div>
                  <Btn size="lg" className="w-full" disabled={!name.trim() || busy}>
                    {busy ? "Making it yours…" : "Create our space ❤️"}
                  </Btn>
                </div>
                <button
                  type="button"
                  onClick={() => setCodeMode(true)}
                  className="w-full py-2 text-sm text-muted-foreground underline-offset-4 hover:underline"
                >
                  Have a room code? Enter it here
                </button>
              </form>
            ) : (
              <form
                className="mt-10 space-y-5"
                onSubmit={(e) => {
                  e.preventDefault();
                  const c = normalizeCode(code);
                  if (!c) return toast.error("That code should look like 7KQ4-M2PX.");
                  void navigate({ to: "/r/$code", params: { code: c } });
                }}
              >
                <Field label="Enter room code">
                  <TextInput
                    autoFocus
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    placeholder="7KQ4-M2PX"
                    className="font-mono tracking-[0.2em] uppercase"
                    autoCapitalize="characters"
                  />
                </Field>
                <Btn size="lg" className="w-full" disabled={!code.trim()}>
                  Continue
                </Btn>
                <button
                  type="button"
                  onClick={() => setCodeMode(false)}
                  className="w-full py-2 text-sm text-muted-foreground hover:underline"
                >
                  Back
                </button>
              </form>
            )}
          </div>
        ) : (
          <div className="animate-arrive">
            <div className="animate-pop mb-6 text-4xl">❤️</div>
            <h1 className="text-4xl leading-tight text-foreground">Your space is ready</h1>
            <p className="mt-3 text-muted-foreground">Invite your partner — they'll join you with one tap.</p>

            <div className="mt-8 rounded-2xl border border-border bg-card p-5">
              <div className="text-sm text-muted-foreground">Invite your partner</div>
              <div className="mt-2 break-all font-mono text-sm text-foreground">{inviteUrl(created)}</div>
              <div className="mt-4 flex gap-2">
                <Btn className="flex-1" onClick={copy}>
                  {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                  {copied ? "Copied" : "Copy invite link"}
                </Btn>
                <Btn variant="outline" onClick={share}>
                  Share
                </Btn>
              </div>
              <div className="mt-5 border-t border-border pt-4 text-sm text-muted-foreground">
                Or they can enter this code:
                <div className="mt-1 font-mono text-2xl tracking-[0.2em] text-foreground">{created}</div>
              </div>
            </div>

            <Btn size="lg" variant="outline" className="mt-6 w-full" onClick={() => navigate({ to: "/today" })}>
              Step inside
            </Btn>
          </div>
        )}
      </div>
    </main>
  );
}
