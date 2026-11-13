import {describe,expect,it} from "vitest";
import {splitDevices} from "./device-groups";
import type {KnownDevice} from "./devices.functions";
const now=Date.parse("2026-11-13T00:00:00Z");
const device=(id:string,current:boolean,lastSeenAt:string|null):KnownDevice=>({
  id, current, lastSeenAt,label:id,createdAt:"2026-09-01T00:00:00Z"
});
describe("real device visibility",()=>{
  it("shows current and recently opened browsers, groups older/unverified entries",()=>{
    const result=splitDevices([
      device("current",true,null),
      device("active",false,"2026-11-12T00:00:00Z"),
      device("old",false,"2026-09-15T00:00:00Z"),
      device("unverified",false,null),
    ],now);
    expect(result.current?.id).toBe("current");
    expect(result.recent.map(d=>d.id)).toEqual(["active"]);
    expect(result.older.map(d=>d.id)).toEqual(["old","unverified"]);
  });
  it("never hides the current device, even without activity metadata",()=>{
    expect(splitDevices([device("current",true,null)],now).current?.id).toBe("current");
  });
});
