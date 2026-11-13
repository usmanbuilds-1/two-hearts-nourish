import type { Meal } from "./nutrition";
import type { MealFavorite } from "./meal-operations.functions";

/** Database stores one favourite per member and food_name, with its own saved portion. */
export function findSavedFood(favorites:MealFavorite[],meal:Pick<Meal,"food_name">):MealFavorite|undefined {
  const key=meal.food_name.trim().toLocaleLowerCase();
  return favorites.find(f=>f.food_name.trim().toLocaleLowerCase()===key);
}

/** An identical name does not mean the portion and macros are the same. */
export function isSavedPortion(f:MealFavorite|undefined,m:Pick<Meal,"serving_description"|"calories"|"protein"|"carbs"|"fat">):boolean {
  if(!f)return false;
  const serving=(v:string|null)=>(v??"").trim().replace(/\s+/g," ").toLocaleLowerCase();
  return serving(f.serving_description)===serving(m.serving_description)
    && Number(f.calories)===Number(m.calories)
    && Number(f.protein)===Number(m.protein)
    && Number(f.carbs)===Number(m.carbs)
    && Number(f.fat)===Number(m.fat);
}
