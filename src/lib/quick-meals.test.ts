import {describe,expect,it} from "vitest";
import {quickMealSuggestions,mealSignature} from "./quick-meals";
import type {Meal} from "./nutrition";

const meal=(overrides:Partial<Meal>={}):Meal=>({
  id:"one",room_id:"room",member_id:"me",food_name:"Rice and chicken",
  serving_description:"1 bowl",calories:450,protein:28,carbs:50,fat:12,
  meal_type:"dinner",meal_date:"2026-11-13",created_at:"2026-11-13T13:00:00Z",
  updated_at:"",ai_confidence:null,...overrides,
});
describe("quick meal suggestions",()=>{
  it("chooses the most recently logged meal even if it was logged today",()=>{
    const older=meal({id:"older",meal_date:"2026-11-12",created_at:"2026-11-12T20:00:00Z"});
    const newest=meal({id:"newer",meal_date:"2026-11-13",created_at:"2026-11-13T13:00:00Z"});
    expect(quickMealSuggestions([older,newest],"me","2026-11-13").latest?.id).toBe("newer");
  });
  it("never offers someone else's meals, planned food or future food",()=>{
    const picks=quickMealSuggestions([
      meal({id:"partner",member_id:"partner"}),
      meal({id:"plan",is_planned:true}),
      meal({id:"future",meal_date:"2026-11-14"}),
      meal({id:"mine"}),
    ],"me","2026-11-13");
    expect(picks.latest?.id).toBe("mine");
    expect(picks.recents).toHaveLength(1);
  });
  it("does not advertise a months-old item as latest",()=>{
    const picks=quickMealSuggestions([meal({meal_date:"2026-09-01",created_at:"2026-09-01T10:00:00Z"})],"me","2026-11-13");
    expect(picks.latest).toBeNull();
  });
  it("groups matching portions and separates variants so macros stay correct",()=>{
    const same=meal({id:"a"});
    const repeat=meal({id:"b",meal_date:"2026-11-12",created_at:"2026-11-12T07:00:00Z"});
    const different=meal({id:"c",calories:700,serving_description:"2 bowls"});
    const picks=quickMealSuggestions([same,repeat,different],"me","2026-11-13");
    expect(picks.usuals).toHaveLength(1);
    expect(picks.usuals[0]?.times).toBe(2);
    expect(picks.usuals[0]?.meal.calories).toBe(450);
    expect(mealSignature(same)).not.toBe(mealSignature(different));
  });
  it("ranks genuinely repeated meals by frequency",()=>{
    const records=[meal({id:"a",food_name:"A"}),meal({id:"b",food_name:"A",meal_date:"2026-11-12"}),meal({id:"c",food_name:"B",created_at:"2026-11-13T14:00:00Z"}),meal({id:"d",food_name:"B",created_at:"2026-11-12T14:00:00Z",meal_date:"2026-11-12"}),meal({id:"e",food_name:"B",created_at:"2026-11-11T14:00:00Z",meal_date:"2026-11-11"})];
    expect(quickMealSuggestions(records,"me","2026-11-13").usuals.map(u=>u.meal.food_name)).toEqual(["B","A"]);
  });
});
