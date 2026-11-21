import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { averageWeekMacros, WeekMacroProgress } from "./WeekMacroProgress";
import { totals, type Meal, type Member } from "@/lib/nutrition";
import type { WeekRow } from "./WeekOverview";

afterEach(cleanup);

const makeMeal = (id: string, owner: string, values: {protein:number;carbs:number;fat:number;calories:number}, planned=false): Meal =>
  ({id, room_id:"room", member_id:owner, meal_date:"2026-11-21", meal_type:"lunch",
    food_name:"Test meal", serving_description:"1 portion", created_at:"", updated_at:"",
    ai_confidence:null, is_planned:planned, ...values}) as Meal;

const values = (p:number,c:number,f:number,calories=400) => ({protein:p,carbs:c,fat:f,calories});
const totalsFor = (list:Meal[]) => totals(list);
const rows:WeekRow[] = [
  { d:"2026-11-15", mineMeals:[], theirMeals:[], mine:totalsFor([makeMeal("a","me",values(20,40,10))]),
    theirs:totalsFor([makeMeal("b","partner",values(30,50,15))]) },
  { d:"2026-11-16", mineMeals:[], theirMeals:[], mine:totalsFor([makeMeal("c","me",values(40,80,20))]),
    theirs:totalsFor([]) },
  ...Array.from({length:5},(_,i)=>({
    d:`2026-11-${i+17}`,mineMeals:[],theirMeals:[],mine:totalsFor([]),theirs:totalsFor([]),
  })),
];
const me = {
  id:"me", display_name:"Me", daily_protein_target:100,
  daily_carbs_target:200,daily_fat_target:50,
} as Member;
const partner = {
  id:"partner", display_name:"Partner", daily_protein_target:60,
  daily_carbs_target:100, daily_fat_target:30,
} as Member;

describe("restored Week macro graphs", () => {
  it("averages only logged days, not 7 days or number of meals", () => {
    const own = averageWeekMacros(rows,"mine");
    expect(own.days).toBe(2);
    expect(own.average).toEqual({protein:30,carbs:60,fat:15});
    const theirs = averageWeekMacros(rows,"theirs");
    expect(theirs.days).toBe(1);
    expect(theirs.average).toEqual({protein:30,carbs:50,fat:15});
    expect(averageWeekMacros(rows.map(row=>({...row,mine:totalsFor([])})),"mine"))
      .toEqual({days:0,average:null});
  });
  it("shows separate member graphs with target-relative percentages", () => {
    render(<WeekMacroProgress rows={rows} me={me} partner={partner}/>);
    expect(screen.getByRole("region",{name:"You average macros"})).toBeInTheDocument();
    expect(screen.getByRole("region",{name:"Partner average macros"})).toBeInTheDocument();
    expect(screen.getByRole("progressbar",{name:"You average protein against goal"}))
      .toHaveAttribute("aria-valuenow","30");
    expect(screen.getByRole("progressbar",{name:"Partner average protein against goal"}))
      .toHaveAttribute("aria-valuenow","50");
    expect(screen.getByRole("progressbar",{name:"You average carbs against goal"}))
      .toHaveAttribute("aria-valuenow","30");
    expect(screen.getByRole("progressbar",{name:"Partner average fat against goal"}))
      .toHaveAttribute("aria-valuenow","50");
  });
  it("shows no fictitious zero-intake graph when no meals are logged", () => {
    const empty = rows.map(row=>({...row,mine:totalsFor([]),theirs:totalsFor([])}));
    render(<WeekMacroProgress rows={empty} me={me} partner={partner}/>);
    expect(screen.getAllByText("No food logged for this period.")).toHaveLength(2);
    expect(screen.queryByRole("progressbar")).toBeNull();
  });
  it("doesn't pretend goals exist or compare partners to one another", () => {
    render(<WeekMacroProgress rows={rows} me={{...me,daily_protein_target:null,daily_carbs_target:null,daily_fat_target:null}} partner={null}/>);
    expect(screen.getAllByText(/No goal/)).toHaveLength(3);
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.queryByRole("region",{name:"Partner average macros"})).toBeNull();
  });
});
