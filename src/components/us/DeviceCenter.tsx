import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { listMyDevices, renameMyDevice, rotateMyRecoveryKeys, type KnownDevice } from "@/lib/devices.functions";
import { friendlyDeviceLabel } from "@/lib/device-label";
import { splitDevices } from "@/lib/device-groups";
import { readSession, writeSession } from "@/lib/session";
import { Btn, TextInput } from "./primitives";

const deviceLabel=()=>friendlyDeviceLabel(navigator.userAgent);

export function DeviceCenter({onKeyRotated}:{onKeyRotated:(key:string)=>void}) {
  const [devices,setDevices]=useState<KnownDevice[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState(false);
  const [busy,setBusy]=useState(false);
  const [newName,setNewName]=useState("");
  const [editing,setEditing]=useState(false);
  const [showOlder,setShowOlder]=useState(false);
  const [latestKey,setLatestKey]=useState<string|null>(null);
  const {current,recent,older}=useMemo(()=>splitDevices(devices),[devices]);

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

  async function rename() {
    const name=newName.trim();
    if(name.length<2||name.length>40){toast.error("Enter a name between 2 and 40 characters.");return;}
    setBusy(true);
    try{
      await renameMyDevice({data:{label:name}});
      await refresh();
      setEditing(false);
      toast.success("This device has been renamed");
    }catch{toast.error("Couldn't rename this device.");}
    finally{setBusy(false);}
  }

  async function rotate(targetId?:string,selectedIds?:string[]) {
    const existing=readSession();
    if(!existing){toast.error("Your local room connection is missing. Reconnect before making changes.");return;}
    if(targetId&&(!devices.some(d=>d.id===targetId&&!d.current)||selectedIds)){
      toast.error("This sign-in is no longer available. Refresh to check.");
      return;
    }
    if(selectedIds&&(!selectedIds.length||selectedIds.some(id=>!devices.some(d=>d.id===id&&!d.current)))){
      toast.error("The selected devices changed. Refresh and try again.");
      return;
    }
    const target=targetId?devices.find(d=>d.id===targetId):null;
    const explanation=selectedIds
      ? `Remove access for ${selectedIds.length} selected old sign-in(s)? If any is still used, that browser will need to reconnect. Every old recovery key for YOUR profile also becomes invalid. Save the replacement key afterwards. Your partner is unaffected.`
      : target
        ? `Remove "${target.label}" (added ${new Date(target.createdAt).toLocaleDateString()})? All your old recovery keys will change. Your partner is unaffected.`
        : "Replace all your recovery keys? Other linked devices stay connected, but all old recovery keys will stop working.";
    if(!window.confirm(explanation))return;
    setBusy(true);
    try {
      const request=selectedIds?{revokeDeviceIds:selectedIds}:targetId?{revokeDeviceId:targetId}:{};
      const {key}=await rotateMyRecoveryKeys({data:request});
      setLatestKey(key);
      onKeyRotated(key);
      let saved=true;
      try{writeSession({...existing,key});}catch{saved=false;}
      await refresh().catch(()=>setError(true));
      if(saved)toast.success(selectedIds?"Selected sign-ins removed":targetId?"Sign-in removed":"Recovery keys replaced");
      else toast.error("The change succeeded but this browser couldn't save your key. Copy it now.");
    }catch {
      // A lost response could occur after the database transaction commits.
      toast.error("Could not confirm the change. Don't clear this browser; check your sign-ins again.");
      await refresh().catch(()=>setError(true));
    }finally{setBusy(false);}
  }

  async function copyKey() {
    if(!latestKey)return;
    try{await navigator.clipboard.writeText(latestKey);toast.success("Recovery key copied");}
    catch{toast.error("Couldn't copy your key.");}
  }

  function deviceRow(d:KnownDevice) {
    const last=d.lastSeenAt?Date.parse(d.lastSeenAt):NaN;
    return (
      <div key={d.id} className="flex min-h-16 items-center justify-between gap-3 border-b border-border/70 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">
            {d.label}
            {d.current&&<span className="ml-2 text-xs text-primary">This browser</span>}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Added {new Date(d.createdAt).toLocaleDateString()}
            {Number.isFinite(last)?` · Last opened ${new Date(last).toLocaleDateString()}`:" · Activity not recorded"}
          </p>
        </div>
        {d.current?(
          <button type="button" disabled={busy} onClick={()=>{setNewName(d.label);setEditing(v=>!v);}}
            className="min-h-11 shrink-0 text-sm font-medium text-primary">Rename</button>
        ):(
          <Btn variant="outline" size="md" disabled={busy} onClick={()=>void rotate(d.id)}>Remove</Btn>
        )}
      </div>
    );
  }

  return (
    <section className="space-y-4 border-t border-border pt-6" aria-label="Connected sign-ins">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-xl">Where you're signed in</h2>
        <button type="button" disabled={busy||loading} onClick={()=>void refresh().catch(()=>setError(true))}
          className="min-h-11 text-sm text-primary disabled:opacity-50">Refresh</button>
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground">
        Only browsers linked to your profile appear here. Your partner has a separate list.
        New browsers appear as their platform and browser; you can rename yours.
      </p>
      {loading&&<p role="status" className="text-sm text-muted-foreground">Checking your sign-ins…</p>}
      {error&&(
        <div role="alert" className="border-y border-border py-3">
          <p className="text-sm">We couldn't verify your sign-ins.</p>
          <Btn variant="outline" className="mt-2" onClick={()=>void refresh().catch(()=>setError(true))}>Try again</Btn>
        </div>
      )}
      {!loading&&!error&&(
        <>
          <div className="border-t border-border">
            {current ? deviceRow(current) : <p className="py-3 text-sm text-muted-foreground">This browser couldn't be identified. Refresh to check.</p>}
            {recent.map(d=>deviceRow(d))}
          </div>
          {editing&&current&&(
            <form className="flex items-center gap-2" onSubmit={e=>{e.preventDefault();void rename();}}>
              <TextInput value={newName} maxLength={40} aria-label="Rename current browser"
                onChange={e=>setNewName(e.target.value)} placeholder="e.g. My everyday phone" className="min-w-0 flex-1"/>
              <Btn disabled={busy||newName.trim().length<2}>Save</Btn>
            </form>
          )}
          {older.length>0&&(
            <div className="space-y-3">
              <button type="button" aria-expanded={showOlder} onClick={()=>setShowOlder(v=>!v)}
                className="flex min-h-12 w-full items-center justify-between border-y border-border py-2 text-left text-sm">
                <span>Older or unverified sign-ins ({older.length})</span>
                <span aria-hidden="true">{showOlder?"−":"+"}</span>
              </button>
              {showOlder&&(
                <>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    These may be previous browser sessions, lost devices, or sign-ins that have not opened the updated app.
                    They are not automatically deleted.
                  </p>
                  <div>{older.map(d=>deviceRow(d))}</div>
                  <Btn variant="outline" className="w-full" disabled={busy}
                    onClick={()=>void rotate(undefined,older.map(d=>d.id))}>
                    Remove these {older.length} sign-ins
                  </Btn>
                </>
              )}
            </div>
          )}
          {devices.length>1&&(
            <Btn variant="outline" className="w-full" disabled={busy}
              onClick={()=>void rotate(undefined,devices.filter(d=>!d.current).map(d=>d.id))}>
              Remove all other sign-ins
            </Btn>
          )}
        </>
      )}
      <div className="space-y-2 pt-2">
        <p className="text-xs text-muted-foreground">
          Removing sign-ins also rotates your own recovery keys. Keep the new key safe so you don't lose access.
        </p>
        <Btn variant="ghost" className="w-full" disabled={busy||loading||error}
          onClick={()=>void rotate()}>Replace my recovery key</Btn>
      </div>
      {latestKey&&(
        <div className="space-y-3 border border-primary/30 bg-primary/5 p-4">
          <p className="text-sm font-semibold">Save your new recovery key</p>
          <p className="break-all font-mono text-xs" role="status">{latestKey}</p>
          <p className="text-xs text-muted-foreground">
            All your older recovery keys are now invalid. Store this somewhere private.
          </p>
          <Btn className="w-full" onClick={()=>void copyKey()}>Copy my new key</Btn>
        </div>
      )}
    </section>
  );
}
