import {addDays, type Meal} from "./nutrition";

export type RegularMeal = {name:string;times:number;lastDate:string};
/** Both members must have independently logged the food; no shared calorie assumptions. */
export function sharedRegularMeals(meals:Meal[],meId:string,partnerId:string):RegularMeal[] {
  const groups=new Map<string,{name:string;members:Set<string>;times:number;lastDate:string}>();
  for(const meal of meals){
    if(meal.is_planned)continue;
    const name=meal.food_name.trim().replace(/\s+/g," ");
    const key=name.toLocaleLowerCase();
    if(!key)continue;
    const g=groups.get(key)??{name,members:new Set<string>(),times:0,lastDate:""};
    g.members.add(meal.member_id);
    g.times++;
    if(meal.meal_date>g.lastDate)g.lastDate=meal.meal_date;
    groups.set(key,g);
  }
  return [...groups.values()].filter(g=>g.members.has(meId)&&g.members.has(partnerId))
    .sort((a,b)=>b.times-a.times||b.lastDate.localeCompare(a.lastDate))
    .slice(0,3).map(g=>({name:g.name,times:g.times,lastDate:g.lastDate}));
}

export function recentCoupleWeek(meals:Meal[],meId:string,partnerId:string,today:string) {
  const start=addDays(today,-6);
  const mine=new Set<string>(),theirs=new Set<string>();
  const dinners=new Map<string,Set<string>>();
  for(const m of meals){
    if(m.is_planned||m.meal_date<start||m.meal_date>today)continue;
    if(m.member_id===meId)mine.add(m.meal_date);
    if(m.member_id===partnerId)theirs.add(m.meal_date);
    if(m.meal_type==="dinner"){
      const set=dinners.get(m.meal_date)??new Set<string>();
      set.add(m.member_id);dinners.set(m.meal_date,set);
    }
  }
  return {
    daysBoth:[...mine].filter(day=>theirs.has(day)).length,
    daysEither:new Set([...mine,...theirs]).size,
    sharedDinnerDays:[...dinners.values()].filter(set=>set.has(meId)&&set.has(partnerId)).length,
  };
}


export type CoupleDay = {
  date:string;
  mine:Meal[];
  theirs:Meal[];
  status:"both"|"you"|"partner"|"neither";
};

/** Last seven calendar days, keeping each partner's entries separate. */
export function coupleWeekDays(meals:Meal[],meId:string,partnerId:string|null,today:string):CoupleDay[] {
  const start=addDays(today,-6);
  const days=new Map<string,{mine:Meal[];theirs:Meal[]}>();
  for(const m of meals) {
    if(m.is_planned||m.meal_date<start||m.meal_date>today)continue;
    if(m.member_id!==meId&&m.member_id!==partnerId)continue;
    const record=days.get(m.meal_date)??{mine:[],theirs:[]};
    if(m.member_id===meId)record.mine.push(m);
    else if(partnerId&&m.member_id===partnerId)record.theirs.push(m);
    days.set(m.meal_date,record);
  }
  return Array.from({length:7},(_,i)=>{
    const date=addDays(start,i);
    const values=days.get(date)??{mine:[],theirs:[]};
    const mine=[...values.mine].sort((a,b)=>b.created_at.localeCompare(a.created_at));
    const theirs=[...values.theirs].sort((a,b)=>b.created_at.localeCompare(a.created_at));
    const status=mine.length&&theirs.length?"both":mine.length?"you":theirs.length?"partner":"neither";
    return {date,mine,theirs,status};
  });
}
