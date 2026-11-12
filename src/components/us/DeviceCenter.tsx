import { useEffect, useState } from "react";
import { toast } from "sonner";
import { listMyDevices, rotateMyRecoveryKeys, type KnownDevice } from "@/lib/devices.functions";
import { friendlyDeviceLabel } from "@/lib/device-label";
import { readSession, writeSession } from "@/lib/session";
import { Btn } from "./primitives";

export function DeviceCenter({ onKeyRotated }: {onKeyRotated: (key:string)=>void}) {
  const [devices,setDevices]=useState<KnownDevice[]>([]);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [latestKey,setLatestKey]=useState<string|null>(null);
  async function refresh() {
    const rows=await listMyDevices({ data: {
      currentLabel: friendlyDeviceLabel(navigator.userAgent)
    }});
    setDevices(rows);
  }
  useEffect(()=>{
    let alive=true;
    listMyDevices({data:{currentLabel:friendlyDeviceLabel(navigator.userAgent)}})
      .then(rows=>{if(alive)setDevices(rows);})
      .catch(()=>{if(alive)toast.error("Couldn't load connected devices.");})
      .finally(()=>{if(alive)setLoading(false);});
    return ()=>{alive=false;};
  },[]);

  async function rotate(targetId?:string) {
    const explanation=targetId
      ? "Revoke this device? For safety, ALL saved recovery keys for your profile will change. Other devices stay signed in but will need fresh recovery links if signed out."
      : "Replace all your recovery keys? Other devices stay signed in, but their old saved recovery keys will stop working.";
    if(!window.confirm(explanation))return;
    setBusy(true);
    try {
      const {key}=await rotateMyRecoveryKeys({data:targetId?{revokeDeviceId:targetId}:{}});
      const existing=readSession();
      if(!existing)throw new Error("NO_LOCAL_SESSION");
      writeSession({...existing,key});
      setLatestKey(key);
      onKeyRotated(key);
      await refresh();
      toast.success(targetId?"Device access revoked":"Recovery keys rotated");
    }catch{
      toast.error("Couldn't complete this safely. Nothing was changed on this phone; reopen Settings to check server status.");
    }finally{setBusy(false);}
  }

  async function copyKey() {
    if(!latestKey)return;
    try{
      await navigator.clipboard.writeText(latestKey);
      toast.success("Recovery key copied. Save it privately.");
    }catch{toast.error("Couldn't copy your key.");}
  }

  return (
    <section className="space-y-3 rounded-2xl border border-border p-4" aria-label="Connected devices">
      <h2 className="font-display text-xl">Your connected devices</h2>
      <p className="text-sm text-muted-foreground">
        Only your devices are shown. You can remove a lost phone without changing your partner's profile.
      </p>
      {loading ? <p className="text-sm text-muted-foreground">Loading devices…</p> : (
        <div className="space-y-2">
          {devices.map(d=>(
            <div key={d.id} className="flex items-center justify-between gap-2 border-t border-border py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{d.label}{d.current?" · This device":""}</p>
                <p className="text-xs text-muted-foreground">
                  Connected {new Date(d.createdAt).toLocaleDateString()}
                  {d.lastSeenAt?" · Seen "+new Date(d.lastSeenAt).toLocaleDateString():""}
                </p>
              </div>
              {!d.current && <Btn variant="outline" disabled={busy}
                onClick={()=>void rotate(d.id)}>Revoke</Btn>}
            </div>
          ))}
        </div>
      )}
      <Btn variant="outline" className="w-full" disabled={busy} onClick={()=>void rotate()}>
        Rotate all my recovery keys
      </Btn>
      {latestKey && (
        <div className="space-y-2 rounded-xl border border-primary/30 p-3">
          <p className="text-sm font-medium">Your new private recovery key</p>
          <p className="break-all font-mono text-xs">{latestKey}</p>
          <p className="text-xs text-muted-foreground">Store this somewhere private. Never send it in a shared room link.</p>
          <Btn className="w-full" variant="outline" onClick={()=>void copyKey()}>Copy new key</Btn>
        </div>
      )}
    </section>
  );
}
