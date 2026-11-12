import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, Copy } from "lucide-react";
import { Btn, Field, TextInput } from "@/components/us/primitives";
import { createRoom } from "@/lib/room.functions";
import { ensureIdentity, friendlyError, inviteUrl, readSession, writeSession } from "@/lib/session";
import { findExistingSignedInSpace } from "@/lib/returning-space";
import { parseSpaceLink, spaceLinkToPath } from "@/lib/space-link";
import { friendlyDeviceLabel } from "@/lib/device-label";

export const Route = createFileRoute("/")({
  ssr: false,
  head:()=>({meta:[
    {title:"Our space — Us"},
    {name:"description",content:"Your private nutrition space for two."},
    {property:"og:title",content:"Our space — Us"}
  ]}),
  component:Onboarding,
});

type Mode="welcome"|"returning"|"create";

function Onboarding() {
  const navigate=useNavigate();
  const [mode,setMode]=useState<Mode>("welcome");
  const [checking,setChecking]=useState(true);
  const [checkError,setCheckError]=useState(false);
  const [name,setName]=useState("");
  const [busy,setBusy]=useState(false);
  const [created,setCreated]=useState<string|null>(null);
  const [copied,setCopied]=useState(false);
  const [link,setLink]=useState("");

  useEffect(()=>{
    let active=true;
    const saved=readSession();
    if(saved){void navigate({to:"/today",replace:true});return;}
    findExistingSignedInSpace().then(result=>{
      if(!active)return;
      if(result){
        writeSession(result);
        void navigate({to:"/today",replace:true});
      }else setChecking(false);
    }).catch(()=>{
      if(active){setCheckError(true);setChecking(false);}
    });
    return ()=>{active=false;};
  },[navigate]);

  async function create(e:React.FormEvent) {
    e.preventDefault();
    if(!name.trim()||checking||busy)return;
    setBusy(true);
    try{
      await ensureIdentity();
      const result=await createRoom({data:{
        name:name.trim(),deviceLabel:friendlyDeviceLabel(navigator.userAgent)
      }});
      writeSession(result);
      setCreated(result.roomCode);
    }catch(error){toast.error(friendlyError(error));}
    finally{setBusy(false);}
  }

  async function copy(){
    if(!created)return;
    try{
      await navigator.clipboard.writeText(inviteUrl(created));
      setCopied(true);
      window.setTimeout(()=>setCopied(false),2000);
    }catch{toast.error("Couldn't copy the invitation.");}
  }

  async function share(){
    if(!created)return;
    if(navigator.share){
      await navigator.share({title:"Our space",text:"Join our private space",url:inviteUrl(created)}).catch(()=>{});
    }else void copy();
  }

  function enter(e:React.FormEvent) {
    e.preventDefault();
    const result=parseSpaceLink(link,window.location.origin);
    if(!result){toast.error("Enter your room code or paste a link from this app.");return;}
    // Keep the one-use secret in the URL fragment, never in a query parameter.
    window.location.assign(spaceLinkToPath(result));
  }

  return (
    <main className="flex min-h-[100dvh] flex-col justify-center bg-background px-6 py-12">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-9 text-sm tracking-wide text-primary">us.</div>
        {checking ? (
          <div aria-live="polite">
            <h1 className="font-display text-3xl">Opening our space…</h1>
            <p className="mt-3 text-sm text-muted-foreground">Checking whether this browser is already connected.</p>
          </div>
        ):checkError?(
          <div>
            <h1 className="font-display text-3xl">We couldn't check your existing sign-in</h1>
            <p className="mt-4 text-muted-foreground">Your profile hasn't been changed. Reconnect to the internet and try again.</p>
            <Btn className="mt-7 w-full" onClick={()=>window.location.reload()}>Try again</Btn>
            <button type="button" className="mt-4 min-h-11 w-full text-sm text-primary"
              onClick={()=>{setCheckError(false);setMode("returning");}}>
              I have a private sign-in link
            </button>
          </div>
        ):created ? (
          <div className="animate-arrive">
            <h1 className="font-display text-4xl">Your space is ready.</h1>
            <p className="mt-3 text-muted-foreground">Invite your partner with one private link.</p>
            <div className="mt-8 border-y border-border py-5">
              <p className="text-sm text-muted-foreground">Invitation link</p>
              <p className="mt-2 break-all text-sm">{inviteUrl(created)}</p>
              <div className="mt-4 flex gap-2">
                <Btn className="flex-1" onClick={()=>void copy()}>
                  {copied?<Check className="size-4"/>:<Copy className="size-4"/>}{copied?"Copied":"Copy"}
                </Btn>
                <Btn variant="outline" onClick={()=>void share()}>Share</Btn>
              </div>
              <p className="mt-4 text-xs text-muted-foreground">Room code: <span className="font-mono">{created}</span></p>
            </div>
            <Btn className="mt-7 w-full" onClick={()=>void navigate({to:"/today"})}>Open our space</Btn>
          </div>
        ):mode==="welcome"?(
          <div className="animate-arrive">
            <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">A private space for two</p>
            <h1 className="mt-3 font-display text-4xl leading-tight">There's room for both of you.</h1>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground">
              Your meals, your familiar routines, and the little things you build together.
            </p>
            <Btn size="lg" className="mt-9 w-full" onClick={()=>setMode("returning")}>I already have a space</Btn>
            <Btn size="lg" variant="outline" className="mt-3 w-full" onClick={()=>setMode("create")}>Create a new space</Btn>
            <p className="mt-6 text-center text-xs text-muted-foreground">
              No daily password. Your browser remembers you until you sign out or clear its data.
            </p>
          </div>
        ):mode==="returning"?(
          <div className="animate-arrive">
            <h1 className="font-display text-4xl">Welcome back.</h1>
            <p className="mt-3 text-muted-foreground">
              Paste your private reconnect link, invitation, or room code.
            </p>
            <form className="mt-8 space-y-4" onSubmit={enter}>
              <Field label="Your link or room code">
                <TextInput value={link} onChange={e=>setLink(e.target.value)}
                  placeholder="Paste a link or XXXX-XXXX" autoCapitalize="off"
                  autoCorrect="off" spellCheck={false} autoComplete="off"/>
              </Field>
              <Btn size="lg" className="w-full" disabled={!link.trim()}>Continue</Btn>
            </form>
            <p className="mt-5 text-sm text-muted-foreground">
              Lost access on this phone? Ask your partner to open Settings → Come back to us and share a private reconnect link.
              A room code alone cannot recover an existing profile.
            </p>
            <button type="button" className="mt-6 min-h-11 text-sm text-primary" onClick={()=>setMode("welcome")}>Back</button>
          </div>
        ):(
          <div className="animate-arrive">
            <h1 className="font-display text-4xl">Start our space.</h1>
            <p className="mt-3 text-muted-foreground">One place for two people. You'll invite the other person next.</p>
            <form onSubmit={e=>void create(e)} className="mt-8 space-y-5">
              <Field label="What should we call you?">
                <TextInput value={name} maxLength={40} onChange={e=>setName(e.target.value)}
                  placeholder="Your name" autoComplete="given-name"/>
              </Field>
              <Btn size="lg" className="w-full" disabled={!name.trim()||busy}>
                {busy?"Creating…":"Create our space"}
              </Btn>
            </form>
            <button type="button" className="mt-6 min-h-11 text-sm text-primary" onClick={()=>setMode("welcome")}>Back</button>
          </div>
        )}
      </div>
    </main>
  );
}
