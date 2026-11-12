import {describe,it,expect} from "vitest";
import {recentCoupleWeek,sharedRegularMeals} from "./couple-insights";
import type {Meal} from "./nutrition";
const m=(id:string,member_id:string,name:string,opts:Partial<Meal>={}):Meal=>({
  id,member_id,food_name:name,room_id:"r",meal_date:"2026-11-13",meal_type:"dinner",
  calories:300,protein:15,carbs:30,fat:10,created_at:"",updated_at:"",
  ai_confidence:null,serving_description:null,...opts
});
describe("couple recap",()=>{
  it("recognizes genuine shared regulars only",()=>{
    expect(sharedRegularMeals([
      m("a","p1","  Fried  Rice "),m("b","p2","fried rice"),m("c","p1","burger")
    ],"p1","p2")).toMatchObject([{name:"Fried Rice",times:2}]);
  });
  it("does not count planned meals or older dates as shared dinners",()=>{
    expect(recentCoupleWeek([
      m("a","p1","rice"),m("b","p2","rice",{is_planned:true}),
      m("c","p2","rice",{meal_date:"2026-10-01"})
    ],"p1","p2","2026-11-13")).toEqual({daysBoth:0,daysEither:1,sharedDinnerDays:0});
  });
});
