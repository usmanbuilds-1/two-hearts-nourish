import { useEffect, useState } from "react";
import { toast } from "sonner";
import { createRejoinLink } from "@/lib/room.functions";
import { buildRejoinUrl } from "@/lib/rejoin-links";
import { Btn } from "./primitives";

type Target = "partner" | "self";
type Issued = { url: string; expiresAt: string; target: Target };

export function RecoveryLinks({ partnerName }: { partnerName: string | null }) {
  const [issued, setIssued] = useState<Issued | null>(null);
  const [working, setWorking] = useState<Target | null>(null);
  const [clock, setClock] = useState(Date.now());

  useEffect(() => {
    if (!issued) return;
    const id = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [issued]);

  const remaining = issued ? Math.max(0, Math.ceil((Date.parse(issued.expiresAt) - clock) / 1000)) : 0;
  const stillValid = issued && remaining > 0;
  const time = `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`;

  async function create(target: Target) {
    setWorking(target);
    setIssued(null);
    try {
      const result = await createRejoinLink({ data: { forMember: target } });
      const url = buildRejoinUrl(window.location.origin, result.roomCode, result.token);
      setClock(Date.now());
      setIssued({ url, expiresAt: result.expiresAt, target });
    } catch (error) {
      toast.error(String(error).includes("NO_PARTNER")
        ? "Your partner hasn't joined this space yet."
        : "Couldn't make a recovery link. Check your connection and try again.");
    } finally {
      setWorking(null);
    }
  }

  async function copy() {
    if (!stillValid) return;
    try {
      await navigator.clipboard.writeText(issued.url);
      toast.success("Recovery link copied");
    } catch {
      toast.error("Couldn't copy the link. Try Share instead.");
    }
  }

  async function share() {
    if (!stillValid) return;
    if (!navigator.share) return void copy();
    try {
      await navigator.share({
        title: "Come back to our space",
        text: issued.target === "partner"
          ? "Here's your secure link back to our little space. Open it on your phone."
          : "Open this on your other device to add it to our space.",
        url: issued.url,
      });
    } catch (error) {
      if ((error as { name?: string })?.name !== "AbortError")
        toast.error("Sharing didn't work. You can copy the link instead.");
    }
  }

  return (
    <section className="space-y-3 rounded-2xl border border-border bg-card p-4" aria-label="Device recovery">
      <h2 className="font-display text-xl text-foreground">Come back to us</h2>
      <p className="text-sm leading-relaxed text-muted-foreground">
        If a phone loses access, send a private link. It restores the existing profile and meals,
        not a new account.
      </p>
      {partnerName ? (
        <Btn className="w-full" disabled={working !== null} onClick={() => void create("partner")}>
          {working === "partner" ? "Creating link…" : `Help ${partnerName} rejoin`}
        </Btn>
      ) : (
        <p className="text-sm text-muted-foreground">You can re-invite your partner after they join.</p>
      )}
      <Btn variant="outline" className="w-full" disabled={working !== null} onClick={() => void create("self")}>
        {working === "self" ? "Creating link…" : "Add one of my other devices"}
      </Btn>
      {issued && (
        <div className="space-y-2 border-t border-border pt-3" role="status" aria-live="polite">
          {stillValid ? (
            <>
              <p className="text-sm font-medium text-foreground">
                {issued.target === "partner" ? `Link for ${partnerName}` : "Link for your other device"} · {time} left
              </p>
              <p className="text-xs text-muted-foreground">
                Only send it to the intended person. It works once, for 20 minutes.
                Generating another link for this person cancels this one.
              </p>
              <div className="flex gap-2">
                <Btn className="flex-1" onClick={() => void share()}>Share link</Btn>
                <Btn className="flex-1" variant="outline" onClick={() => void copy()}>Copy link</Btn>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">This link expired. Generate a new one above.</p>
          )}
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        On iPhone, open in regular Safari rather than an in-app browser.
      </p>
    </section>
  );
}
