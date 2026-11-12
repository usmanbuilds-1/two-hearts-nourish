import type {Meal} from "./nutrition";

/** Preserves the member's original serving, not just unscaled macros.
 *  Photos are deliberately excluded: a new meal should not inherit an old photo.
 */
export function mealCopyFields(source:Meal,targetDate:string) {
  return {
    room_id: source.room_id,
    member_id: source.member_id,
    food_name: source.food_name,
    serving_description: source.serving_description,
    calories: source.calories,
    protein: source.protein,
    carbs: source.carbs,
    fat: source.fat,
    meal_type: source.meal_type,
    meal_date: targetDate,
    ai_confidence: source.ai_confidence,
    portion_percentage: source.portion_percentage ?? 100,
    nominal_calories: source.nominal_calories ?? null,
    nominal_protein: source.nominal_protein ?? null,
    nominal_carbs: source.nominal_carbs ?? null,
    nominal_fat: source.nominal_fat ?? null,
    is_planned: source.is_planned ?? false,
  };
}
