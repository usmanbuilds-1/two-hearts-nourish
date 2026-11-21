import { useEffect, useState } from "react";
import { toast } from "sonner";
import { createRejoinLink } from "@/lib/room.functions";
import { buildRejoinUrl } from "@/lib/rejoin-links";
import { useSpace } from "@/lib/space";
import { Btn } from "./primitives";

type Issued = { url: string; expiresAt: string };

export function RecoveryLinks({ partnerName }: { partnerName: string | null }) {
  const { room } = useSpace();
  const [issued, setIssued] = useState<Issued | null>(null);
  const [working, setWorking] = useState(false);
  const [helping, setHelping] = useState(false);
  const [clock, setClock] = useState(Date.now());

  useEffect(() => {
    if (!issued) return;
    const id = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [issued]);

  const remaining = issued ? Math.max(0, Math.ceil((Date.parse(issued.expiresAt) - clock) / 1000)) : 0;
  const stillValid = issued && remaining > 0;
  const time = `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`;

  async function createSelfLink() {
    setWorking(true);
    setIssued(null);
    try {
      const result = await createRejoinLink({ data: { forMember: "self" } });
      const url = buildRejoinUrl(window.location.origin, result.roomCode, result.token);
      setClock(Date.now());
      setIssued({ url, expiresAt: result.expiresAt });
    } catch {
      toast.error("Couldn't make your recovery link. Check your connection and try again.");
    } finally {
      setWorking(false);
    }
  }

  /** Safe partner assistance: this is only the destination, never a login token.
   * The recipient has to prove ownership with THEIR own recovery key.
   */
  async function helpPartner() {
    if (!partnerName) return;
    const url = window.location.origin + "/r/" + encodeURIComponent(room.room_code);
    const text = `Open our private space: ${url}\nChoose "Use my recovery key" and enter YOUR own private recovery key. The room code or this link alone cannot sign you in. If your key is lost, check another signed-in device or a securely saved backup.`;
    setHelping(true);
    try {
      if (navigator.share) {
        await navigator.share({ title: "Come back to our space", text });
      } else {
        await navigator.clipboard.writeText(text);
        toast.success("Recovery instructions copied");
      }
    } catch (error) {
      if ((error as { name?: string })?.name !== "AbortError")
        toast.error("Couldn't share instructions. Copy your room code and ask your partner to use their own recovery key.");
    } finally {
      setHelping(false);
    }
  }

  async function copy() {
    if (!stillValid) return;
    try {
      await navigator.clipboard.writeText(issued.url);
      toast.success("Your recovery link copied");
    } catch {
      toast.error("Couldn't copy the link. Try Share instead.");
    }
  }

  async function share() {
    if (!stillValid) return;
    if (!navigator.share) return void copy();
    try {
      await navigator.share({
        title: "Add my other device",
        text: "Open this one-use link on another device to connect it to MY profile.",
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
        Keep your own private recovery key somewhere safe. Your account and your partner's account
        have separate sign-ins, even though you share this space.
      </p>
      {partnerName ? (
        <>
          <Btn className="w-full" disabled={working || helping} onClick={() => void helpPartner()}>
            {helping ? "Opening share…" : `Help ${partnerName} reconnect`}
          </Btn>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Sends your partner the recovery page and instructions, not a login token.
            They'll need their own recovery key or another signed-in device.
          </p>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">You can help your partner reconnect after they join.</p>
      )}
      <Btn variant="outline" className="w-full" disabled={working || helping} onClick={() => void createSelfLink()}>
        {working ? "Creating link…" : "Add one of my other devices"}
      </Btn>
      {issued && (
        <div className="space-y-2 border-t border-border pt-3" role="status" aria-live="polite">
          {stillValid ? (
            <>
              <p className="text-sm font-medium text-foreground">
                Link for your other device · {time} left
              </p>
              <p className="text-xs text-muted-foreground">
                This link signs in as YOU. Keep it private. It works once, for 20 minutes.
                Creating another link for your profile cancels this one.
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
        If every signed-in device and saved recovery key are lost, this recovery method cannot restore the old profile.
      </p>
    </section>
  );
}
