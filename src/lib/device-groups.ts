import type { KnownDevice } from "./devices.functions";

export function splitDevices(devices:KnownDevice[],now=Date.now()){
  const current=devices.find(d=>d.current)??null;
  const recent:KnownDevice[]=[];
  const older:KnownDevice[]=[];
  const threshold=now-30*86400000;
  for(const device of devices){
    if(device.current)continue;
    const last=device.lastSeenAt?Date.parse(device.lastSeenAt):NaN;
    if(Number.isFinite(last)&&last>=threshold&&last<=now+60000)recent.push(device);
    else older.push(device);
  }
  return {current,recent,older};
}
