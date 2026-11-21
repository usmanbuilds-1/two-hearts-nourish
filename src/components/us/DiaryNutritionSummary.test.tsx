import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DiaryNutritionSummary, diaryProgress } from "./DiaryNutritionSummary";
import { totals, type Meal, type Member } from "@/lib/nutrition";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) =>
    <a href={to}>{children}</a>,
}));
afterEach(cleanup);

const member = {
  daily_calorie_target: 2610,
  daily_protein_target: 120,
  daily_carbs_target: 320,
  daily_fat_target: 85,
} as Member;

const example = {
  id:"a", food_name:"Noodles", calories:280, protein:18, carbs:30, fat:10,
  meal_date:"2026-11-21", meal_type:"breakfast", member_id:"me",room_id:"r",
  serving_description:"1 plate", ai_confidence:null, created_at:"",updated_at:"",
} as Meal;

describe("Diary nutrition summary", () => {
  it("computes progress from actual member goals and excludes planned food", () => {
    const logged = totals([
      example,
      { ...example,id:"b",calories:150,protein:5,carbs:23,fat:4,is_planned:true },
    ]);
    expect(logged.calories).toBe(280);
    render(<DiaryNutritionSummary member={member} logged={logged} />);
    expect(screen.getByText("280")).toBeInTheDocument();
    expect(screen.getByText("/ 2,610 kcal")).toBeInTheDocument();
    expect(screen.getByText("2,330 remaining")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name:"Calories logged against daily target" }))
      .toHaveAttribute("aria-valuenow","11");
    expect(screen.getByText("18")).toBeInTheDocument();
  });

  it("never treats missing targets as 100% progress", () => {
    expect(diaryProgress(300, null)).toBe(0);
    expect(diaryProgress(300, 0)).toBe(0);
    expect(diaryProgress(300, 200)).toBe(100);
    const noTargets = { ...member, daily_calorie_target:null, daily_protein_target:null,
      daily_carbs_target:null, daily_fat_target:null };
    render(<DiaryNutritionSummary member={noTargets} logged={totals([example])} />);
    expect(screen.getByRole("link", { name:"Set a calorie goal" })).toHaveAttribute("href","/settings");
    expect(screen.getByRole("progressbar", { name:"Calories logged against daily target" }))
      .toHaveAttribute("aria-valuenow","0");
  });

  it("uses neutral copy rather than alarming someone above target", () => {
    render(<DiaryNutritionSummary member={{...member,daily_calorie_target:200}} logged={totals([example])} />);
    expect(screen.getByText("80 above target")).toBeInTheDocument();
    expect(screen.queryByText(/calories over!/i)).toBeNull();
  });
});
