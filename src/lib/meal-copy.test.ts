import {describe,expect,it} from "vitest";
import {mealCopyFields} from "./meal-copy";
import type {Meal} from "./nutrition";
const example:Meal={
  id:"old",room_id:"room",member_id:"mine",food_name:"Same curry",
  serving_description:"3/4 bowl",calories:320,protein:16,carbs:35,fat:13,
  meal_type:"dinner",meal_date:"2026-11-11",created_at:"2026-11-11T15:00:00Z",
  updated_at:"",ai_confidence:null,photo_url:"room/old-photo.jpg",portion_percentage:75,
  nominal_calories:427,nominal_protein:21.3,nominal_carbs:46.7,nominal_fat:17.3,
};
describe("safe meal repeat snapshots",()=>{
  it("repeats the same portion and macros, not the old photo",()=>{
    const copied=mealCopyFields(example,"2026-11-13");
    expect(copied).toMatchObject({member_id:"mine",meal_date:"2026-11-13",portion_percentage:75,calories:320,nominal_calories:427});
    expect("photo_url" in copied).toBe(false);
    expect("id" in copied).toBe(false);
    expect("created_at" in copied).toBe(false);
  });
  it("does not silently turn a planned diary entry into an eaten meal when copying days",()=>{
    expect(mealCopyFields({...example,is_planned:true},"2026-11-13").is_planned).toBe(true);
  });
});
