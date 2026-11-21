import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WeekOverview, weekAtAGlance, type WeekRow } from "./WeekOverview";
import { totals, type Meal, type Member } from "@/lib/nutrition";

afterEach(cleanup);
const member = {id:"me", display_name:"Me", daily_calorie_target:2610} as Member;
const partner = {id:"partner", display_name:"Partner", daily_calorie_target:2000} as Member;
const meal = (day:string, owner:string, calories:number, planned=false): Meal => ({
  id:day+owner+(planned?"p":""),
  room_id:"room",member_id:owner,meal_date:day,
  food_name:"Example meal",meal_type:"lunch",created_at:"",updated_at:"",
  serving_description:"A serving",ai_confidence:null,
  calories,protein:20,carbs:40,fat:10,is_planned:planned,
});
const days=Array.from({length:7},(_,i)=>`2026-11-${String(15+i).padStart(2,"0")}`);
const rows: WeekRow[] = days.map((d,i)=>{
  const mineMeals = i < 4 ? [meal(d,"me",i===3?0:500)] : [];
  const theirMeals = i < 2 ? [meal(d,"partner",450)] : [];
  return { d, mineMeals, theirMeals, mine: totals(mineMeals), theirs: totals(theirMeals) };
});

describe("Week overview", () => {
  it("never treats an unlogged day as recorded 0 kcal or a completed intake day",()=>{
    const summary=weekAtAGlance(rows);
    expect(summary).toEqual({bothLogged:2,mineLoggedDays:4,mineLoggedDayAverage:375});
    expect(weekAtAGlance(rows.map(r=>({...r,mine:totals([]),theirs:totals([])})))).toEqual({
      bothLogged:0,mineLoggedDays:0,mineLoggedDayAverage:null,
    });
  });
  it("shows selected day's actual logging with clear missing data and separate goals",()=>{
    const onSelect=vi.fn();
    render(<WeekOverview rows={rows} me={member} partner={partner}
      selectedDay="2026-11-21" onSelectDay={onSelect}
      onPreviousWeek={vi.fn()} onNextWeek={vi.fn()} atCurrentWeek onShowWeight={vi.fn()} />);
    expect(screen.getByText("Days both logged")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getAllByText("375").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Not logged").length).toBe(2);
    expect(screen.getByText(/does not mean 0 kcal/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button",{name:/Nov 15: you 500 kcal/i}));
    expect(onSelect).toHaveBeenCalledWith("2026-11-15");
    expect(screen.getByRole("button",{name:"Next week"})).toBeDisabled();
  });
  it("handles single-member rooms without fabricated partner records",()=>{
    render(<WeekOverview rows={rows} me={member} partner={null}
      selectedDay="2026-11-18" onSelectDay={vi.fn()}
      onPreviousWeek={vi.fn()} onNextWeek={vi.fn()} atCurrentWeek={false} onShowWeight={vi.fn()} />);
    expect(screen.getByText("Days you logged")).toBeInTheDocument();
    expect(screen.queryByText("Partner")).toBeNull();
    expect(screen.getByText("0")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button",{name:"View weight trend"}));
  });
});
