import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { listMyDevices, renameMyDevice, rotateMyRecoveryKeys, type KnownDevice } from "@/lib/devices.functions";
import { friendlyDeviceLabel } from "@/lib/device-label";
import { readSession, writeSession } from "@/lib/session";
import { Btn, TextInput } from "./primitives";

const deviceLabel=()=>friendlyDeviceLabel(navigator.userAgent);

export function DeviceCenter({ onKeyRotated }: {onKeyRotated: (key:string)=>void}) {
  const [devices,setDevices]=useState<KnownDevice[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState(false);
  const [busy,setBusy]=useState(false);
  const [newName,setNewName]=useState("");
  const [editing,setEditing]=useState(false);
  const [latestKey,setLatestKey]=useState<string|null>(null);
  const refresh=useCallback(async()=>{
    const rows=await listMyDevices({data:{currentLabel:deviceLabel()}});
    setDevices(rows);
    setError(false);
  },[]);

  useEffect(()=>{
    let active=true;
    listMyDevices({data:{currentLabel:deviceLabel()}})
      .then(rows=>{if(active)setDevices(rows);})
      .catch(()=>{if(active)setError(true);})
      .finally(()=>{if(active)setLoading(false);});
    return ()=>{active=false;};
  },[]);

  async function rename(){
    const name=newName.trim();
    if(name.length<2||name.length>40){toast.error("Use 2–40 characters for the name.");return;}
    setBusy(true);
    try{
      await renameMyDevice({data:{label:name}});
      await refresh();
      setEditing(false);
      toast.success("Device name updated");
    }catch{toast.error("Couldn't rename this device.");}
    finally{setBusy(false);}
  }

  async function rotate(targetId?:string) {
    const explanation=targetId
      ? "Remove this sign-in? Every old recovery key for YOUR profile will be invalidated, including keys saved on your other devices. Your partner's profile is unaffected. Save the replacement key before leaving Settings."
      : "Replace all recovery keys for YOUR profile? Other devices remain signed in but cannot recover with their old keys. Save the replacement key.";
    if(!window.confirm(explanation))return;
    const existing=readSession();
    if(!existing)return toast.error("No local session found. Don't remove this browser's data.");
    setBusy(true);
    try {
      const {key}=await rotateMyRecoveryKeys({data:targetId?{revokeDeviceId:targetId}:{}});
      setLatestKey(key);
      onKeyRotated(key);
      let stored=true;
      try {writeSession({...existing,key});} catch {stored=false;}
      await refresh().catch(()=>{setError(true);});
      if(stored) toast.success(targetId?"Device revoked. Save your new key.":"Keys rotated. Save your new key.");
      else toast.error("Change succeeded but key couldn't be saved on this browser. Copy it now.");
    }catch{
      // The remote transaction may have succeeded even if the response was lost.
      toast.error("Couldn't confirm the change. Check this list again; don't clear this browser.");
      await refresh().catch(()=>setError(true));
    }finally{setBusy(false);}
  }

  async function copyKey() {
    if(!latestKey)return;
    try{
      await navigator.clipboard.writeText(latestKey);
      toast.success("Recovery key copied. Store it privately.");
    }catch{toast.error("Couldn't copy your key.");}
  }
  const current=devices.find(d=>d.current);
  return (
    <section className="space-y-3 border-t border-border pt-5" aria-label="My connected devices">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-xl">My devices</h2>
        <button type="button" disabled={busy||loading} onClick={()=>void refresh().catch(()=>setError(true))}
          className="min-h-11 text-sm font-medium text-primary disabled:opacity-50">
          Refresh
        </button>
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground">
        These sign-ins belong to your profile, not your partner's. A device is recorded when it joins your profile; it isn't a live activity tracker.
      </p>
      {loading&&<p role="status" className="py-3 text-sm text-muted-foreground">Loading your devices…</p>}
      {error&&(
        <div className="border-y border-border py-3">
          <p role="alert" className="text-sm">Couldn't verify your device list.</p>
          <Btn variant="outline" className="mt-2" onClick={()=>void refresh().catch(()=>setError(true))}>Try again</Btn>
        </div>
      )}
      {!loading&&!error&&(
        <div className="divide-y divide-border border-y border-border">
          {devices.map(d=>(
            <div key={d.id} className="flex min-h-16 items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {d.label}{d.current&&<span className="ml-2 text-xs font-normal text-primary">This device</span>}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Added {new Date(d.createdAt).toLocaleDateString()}
                  {d.lastSeenAt?" · Settings opened "+new Date(d.lastSeenAt).toLocaleDateString():""}
                </p>
              </div>
              {d.current?(
                <button type="button" disabled={busy} onClick={()=>{setNewName(d.label);setEditing(v=>!v);}}
                  className="min-h-11 shrink-0 text-sm font-medium text-primary">
                  Rename
                </button>
              ):(
                <Btn size="md" variant="outline" disabled={busy} onClick={()=>void rotate(d.id)}>Revoke</Btn>
              )}
            </div>
          ))}
        </div>
      )}
      {editing&&current&&(
        <form className="flex items-center gap-2" onSubmit={e=>{e.preventDefault();void rename();}}>
          <TextInput value={newName} maxLength={40} onChange={e=>setNewName(e.target.value)}
            aria-label="Name this device" placeholder="e.g. My personal phone" className="min-w-0 flex-1"/>
          <Btn disabled={busy||newName.trim().length<2}>Save</Btn>
        </form>
      )}
      {!loading&&!error&&devices.some(d=>!d.current&&!d.lastSeenAt)&&(
        <p className="text-xs text-muted-foreground">
          Older devices may show generic names until they open Settings. Do not revoke an unfamiliar entry without checking.
        </p>
      )}
      <Btn variant="outline" className="w-full" disabled={busy||loading||error} onClick={()=>void rotate()}>
        Replace all my recovery keys
      </Btn>
      {latestKey&&(
        <div className="space-y-3 border border-primary/30 bg-primary/5 p-4">
          <p className="text-sm font-semibold">Important: save your new recovery key</p>
          <p className="break-all font-mono text-xs" role="status">{latestKey}</p>
          <p className="text-xs text-muted-foreground">
            All previous recovery keys for your profile no longer work. Keep this one private and safe.
          </p>
          <Btn className="w-full" onClick={()=>void copyKey()}>Copy replacement key</Btn>
        </div>
      )}
    </section>
  );
}
