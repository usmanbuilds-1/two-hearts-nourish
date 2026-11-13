import {describe,expect,it} from "vitest";
import {findSavedFood,isSavedPortion} from "./favorite-meals";
import type {MealFavorite} from "./meal-operations.functions";

const saved:MealFavorite={
  id:"f1",food_name:"Chicken rice",serving_description:"1 bowl",
  calories:420,protein:28,carbs:43,fat:10
};
describe("saved portions",()=>{
  it("finds a food by its name but does not treat a different portion as saved",()=>{
    const fav=findSavedFood([saved],{food_name:" chicken RICE "});
    expect(fav?.id).toBe("f1");
    expect(isSavedPortion(fav,{serving_description:"2 bowls",calories:840,protein:56,carbs:86,fat:20})).toBe(false);
  });
  it("matches the exact saved serving and nutrition",()=>{
    expect(isSavedPortion(saved,{serving_description:" 1 bowl ",calories:420,protein:28,carbs:43,fat:10})).toBe(true);
  });
  it("does not mark an unsaved food as saved",()=>{
    expect(isSavedPortion(undefined,{serving_description:null,calories:0,protein:0,carbs:0,fat:0})).toBe(false);
  });
});
