import {describe,it,expect} from "vitest";
import {recentCoupleWeek,sharedRegularMeals,coupleWeekDays} from "./couple-insights";
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

describe("seven-day couple journal",()=>{
  it("separates partners, excludes planned meals and provides seven ascending days",()=>{
    const days=coupleWeekDays([
      m("a","p1","Rice",{meal_date:"2026-11-13"}),
      m("b","p2","Soup",{meal_date:"2026-11-13"}),
      m("c","p1","Plan",{is_planned:true,meal_date:"2026-11-12"}),
      m("d","p2","Old",{meal_date:"2026-10-14"}),
      m("e","other","Hidden",{meal_date:"2026-11-13"}),
      m("f","p2","Breakfast",{meal_date:"2026-11-10"}),
    ],"p1","p2","2026-11-13");
    expect(days).toHaveLength(7);
    expect(days[0]?.date).toBe("2026-11-07");
    expect(days.at(-1)?.status).toBe("both");
    expect(days.at(-1)?.mine.map(x=>x.id)).toEqual(["a"]);
    expect(days.at(-1)?.theirs.map(x=>x.id)).toEqual(["b"]);
    expect(days.find(x=>x.date==="2026-11-12")?.status).toBe("neither");
    expect(days.find(x=>x.date==="2026-11-10")?.status).toBe("partner");
  });
  it("does not invent partner activity if the partner has not joined",()=>{
    const day=coupleWeekDays([m("a","p1","Rice")],"p1",null,"2026-11-13").at(-1);
    expect(day?.status).toBe("you");
    expect(day?.theirs).toHaveLength(0);
  });
});
