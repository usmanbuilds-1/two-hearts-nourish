import {describe,expect,it} from "vitest";
import {validMilestoneDate,upcomingOccurrence,upcomingMilestones,canEditMilestone} from "./couple-milestones";

describe("relationship milestone dates",()=>{
  it("rejects invalid and impossible calendar dates",()=>{
    expect(validMilestoneDate("2026-02-29")).toBe(false);
    expect(validMilestoneDate("2024-02-29")).toBe(true);
    expect(validMilestoneDate("2026-13-01")).toBe(false);
    expect(validMilestoneDate("2026-11-31")).toBe(false);
    expect(validMilestoneDate("junk")).toBe(false);
  });
  it("counts anniversaries in whole calendar days across year changes",()=>{
    expect(upcomingOccurrence("2023-11-16","2026-11-14",true))
      .toEqual({date:"2026-11-16",daysAway:2,years:3});
    expect(upcomingOccurrence("2023-11-01","2026-11-14",true))
      .toEqual({date:"2027-11-01",daysAway:352,years:4});
  });
  it("handles Feb 29 anniversaries without March rollover",()=>{
    expect(upcomingOccurrence("2024-02-29","2027-02-27",true))
      .toEqual({date:"2027-02-28",daysAway:1,years:3});
    expect(upcomingOccurrence("2024-02-29","2028-02-28",true))
      .toEqual({date:"2028-02-29",daysAway:1,years:4});
  });
  it("never silently turns a one-time past milestone into a repeating event",()=>{
    expect(upcomingOccurrence("2025-11-13","2026-11-14",false)).toBeNull();
  });
  it("only uses actually supplied dates; no invented couple milestones",()=>{
    expect(upcomingMilestones([],null,"2026-11-14")).toEqual([]);
    const result=upcomingMilestones([
      {id:"one",title:"First trip",milestone_date:"2025-11-15",repeats_annually:true},
      {id:"two",title:"A future plan",milestone_date:"2026-11-18",repeats_annually:false},
    ],"2022-12-01","2026-11-14");
    expect(result.map(x=>[x.title,x.daysAway])).toEqual([
      ["First trip",1],["A future plan",4],["Our anniversary",17]
    ]);
  });
  it("allows each partner to edit only their own entries",()=>{
    expect(canEditMilestone("a","a")).toBe(true);
    expect(canEditMilestone("a","b")).toBe(false);
  });
});
