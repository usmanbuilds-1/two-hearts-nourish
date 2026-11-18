import { describe, expect, it } from "vitest";
import { totals, coupleStats, adherencePct, type Meal, type Member } from "./nutrition";
const meal = (p: Partial<Meal>): Meal => ({
  id:"meal",room_id:"room",member_id:"a",food_name:"Food",calories:400,protein:20,carbs:40,fat:10,
  meal_type:"lunch",meal_date:"2026-11-13",created_at:"",updated_at:"",
  serving_description:null,ai_confidence:null,...p
});
const member = (id:string) => ({ id, daily_protein_target:20 } as Member);
describe("planned meals are not consumed",()=>{
  it("does not score unconfirmed partial days as complete adherence", () => {
    const days = new Map([["2026-11-10", { calories: 2500 }], ["2026-11-11", { calories: 2100 }]]);
    expect(adherencePct(days, 2500, "2026-11-12", new Set())).toBe(0);
    expect(adherencePct(days, 2500, "2026-11-12", new Set(["2026-11-10"]))).toBe(100);
    expect(adherencePct(days, 2500, "2026-11-12", new Set(["2026-11-10","2026-11-11"]))).toBe(50);
  });
  it("does not inflate daily macros and total counts",()=>{
    expect(totals([meal({}),meal({id:"p",is_planned:true,calories:900})])).toEqual({
      calories:400,protein:20,carbs:40,fat:10,count:1
    });
  });
  it("does not create fake shared meal days or milestones",()=>{
    const stats=coupleStats([meal({is_planned:true}),meal({id:"b",member_id:"b"})],member("a"),member("b"),"2026-11-13");
    expect(stats.daysBoth).toBe(0);
    expect(stats.totalMeals).toBe(1);
  });
});
