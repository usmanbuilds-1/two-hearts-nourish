import {describe,expect,it} from "vitest";
import {ALL_QUOTES,REDDIT_INSPIRED_QUOTES,TODAY_QUOTES,quoteForDay} from "./quotes";

const PROFANITY=/\b(?:fuck\w*|shit\w*|bitch\w*|asshole\w*|cunt\w*|dick\w*|bastard\w*|damn\w*|crap\w*|motherfucker\w*)\b/i;

describe("daily couple quotes",()=>{
  it("keeps exactly 50 new Reddit-inspired original lines",()=>{
    expect(REDDIT_INSPIRED_QUOTES).toHaveLength(50);
  });
  it("contains no profanity, URLs, or duplicate lines",()=>{
    expect(ALL_QUOTES.some(q=>PROFANITY.test(q))).toBe(false);
    expect(ALL_QUOTES.some(q=>/https?:\/\/|www\./i.test(q))).toBe(false);
    expect(new Set(ALL_QUOTES.map(q=>q.trim().toLocaleLowerCase())).size).toBe(ALL_QUOTES.length);
  });
  it("is stable for the same local calendar day",()=>{
    expect(quoteForDay("2026-11-14")).toBe(quoteForDay("2026-11-14"));
  });
  it("changes across at least some nearby days",()=>{
    const unique=new Set(Array.from({length:14},(_,i)=>quoteForDay(`2026-11-${String(14+i).padStart(2,"0")}`)));
    expect(unique.size).toBeGreaterThan(1);
  });
  it("restores 60 existing romantic and supportive quotes instead of generic editorial filler",()=>{
    expect(TODAY_QUOTES).toHaveLength(60);
    expect(new Set(TODAY_QUOTES).size).toBe(60);
    expect(TODAY_QUOTES.every(line=>ALL_QUOTES.includes(line))).toBe(true);
    expect(TODAY_QUOTES).toContain("I'm rooting for you quietly, all day long.");
    expect(TODAY_QUOTES).toContain("You don't have to have a perfect day to tell me about it.");
    expect(TODAY_QUOTES).toContain("You make the distance feel worth it.");
    expect(TODAY_QUOTES).not.toContain("There's no special occasion. I just really love you.");
  });
  it("rotates through all 60 quotes without repeating in the same 60-day cycle",()=>{
    const start=Date.UTC(2026,10,21);
    const days=Array.from({length:60},(_,i)=>
      new Date(start+i*86_400_000).toISOString().slice(0,10));
    expect(new Set(days.map(quoteForDay)).size).toBe(60);
  });
  it("always returns a non-empty quote",()=>{
    expect(quoteForDay("2026-11-14").trim().length).toBeGreaterThan(10);
  });
});
