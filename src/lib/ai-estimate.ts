/** Reject physically inconsistent AI output rather than silently "fixing" macros. */
export function isPlausibleNutrition(estimate:{
  calories:number;protein:number;carbs:number;fat:number
}):boolean {
  const {calories,protein,carbs,fat}=estimate;
  const values=[calories,protein,carbs,fat];
  if(values.some(v=>!Number.isFinite(v)||v<0))return false;
  if(calories>10000||protein>1000||carbs>1000||fat>1000)return false;
  const estimatedEnergy=4*protein+4*carbs+9*fat;
  if(calories===0)return estimatedEnergy===0;
  if(estimatedEnergy===0)return false;
  return Math.abs(calories-estimatedEnergy)<=Math.max(250,calories*0.50);
}
