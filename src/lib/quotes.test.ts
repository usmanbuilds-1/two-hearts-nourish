import {describe,expect,it} from "vitest";
import {quoteForDay} from "./quotes";

describe("daily couple quote",()=>{
  it("is stable for the same local calendar day",()=>{
    expect(quoteForDay("2026-11-14")).toBe(quoteForDay("2026-11-14"));
  });
  it("returns a real non-empty quote",()=>{
    expect(quoteForDay("2026-11-14").trim().length).toBeGreaterThan(10);
  });
  it("changes across at least some nearby days",()=>{
    const unique=new Set(Array.from({length:7},(_,i)=>quoteForDay(`2026-11-${String(14+i).padStart(2,"0")}`)));
    expect(unique.size).toBeGreaterThan(1);
  });
});
