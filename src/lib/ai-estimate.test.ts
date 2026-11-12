import {describe,expect,it} from "vitest";
import {isPlausibleNutrition} from "./ai-estimate";
describe("AI nutrition estimation sanity",()=>{
  it("accepts consistent approximate macros",()=>{
    expect(isPlausibleNutrition({calories:600,protein:35,carbs:70,fat:20})).toBe(true);
  });
  it("rejects hallucinated energy and missing macros",()=>{
    expect(isPlausibleNutrition({calories:5000,protein:2,carbs:1,fat:1})).toBe(false);
    expect(isPlausibleNutrition({calories:400,protein:0,carbs:0,fat:0})).toBe(false);
    expect(isPlausibleNutrition({calories:-5,protein:1,carbs:1,fat:1})).toBe(false);
  });
});
