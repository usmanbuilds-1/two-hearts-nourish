import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Btn } from "./primitives";
import { emptyDraft, useSaveMeal } from "./MealSheet";
import { getFavoriteMeals, removeFavoriteMeal, saveFavoriteMeal, type MealFavorite } from "@/lib/meal-operations.functions";
import { fmt, defaultMealType, type Meal } from "@/lib/nutrition";
import { mealSignature, quickMealSuggestions } from "@/lib/quick-meals";
import { cn } from "@/lib/utils";

type Tab = "mine" | "recent" | "saved";
export function QuickMealsSheet({
  open,onOpenChange,meals,memberId,today,onCopy,busyId
}:{
  open:boolean;
  onOpenChange:(open:boolean)=>void;
  meals:Meal[];
  memberId:string;
  today:string;
  onCopy:(meal:Meal)=>Promise<void>;
  busyId:string|null;
}) {
  const [tab,setTab]=useState<Tab>("mine");
  const [favoriteBusy,setFavoriteBusy]=useState<string|null>(null);
  const save=useSaveMeal();
  const qc=useQueryClient();
  const picks=useMemo(()=>quickMealSuggestions(meals,memberId,today),[meals,memberId,today]);
  const {data:favorites=[],isPending:favoritesPending,isError:favoritesError,refetch}=useQuery<MealFavorite[]>({
    queryKey:["meal-favorites",memberId],
    queryFn:()=>getFavoriteMeals(),
    enabled:open,
    refetchOnMount:"always",
  });
  const savedNames=useMemo(()=>new Set(favorites.map(m=>m.food_name.trim().toLocaleLowerCase())),[favorites]);

  async function logSaved(m:MealFavorite) {
    if(favoriteBusy)return;
    setFavoriteBusy(m.id);
    try {
      await save({
        ...emptyDraft(),
        food_name:m.food_name,
        serving_description:m.serving_description??"",
        calories:String(m.calories),
        protein:String(m.protein),
        carbs:String(m.carbs),
        fat:String(m.fat),
        meal_type:defaultMealType(),
      });
      onOpenChange(false);
      toast.success(`${m.food_name} added with your saved portion`);
    }catch{toast.error("Couldn't log this meal.");}
    finally{setFavoriteBusy(null);}
  }

  async function toggleSaved(meal:Meal) {
    const name=meal.food_name.trim();
    setFavoriteBusy(meal.id);
    try {
      if(savedNames.has(name.toLocaleLowerCase())) {
        await removeFavoriteMeal({data:{foodName:name}});
      }else{
        await saveFavoriteMeal({data:{
          foodName:name,servingDescription:meal.serving_description??"",
          calories:meal.calories,protein:Number(meal.protein),carbs:Number(meal.carbs),fat:Number(meal.fat),
        }});
      }
      await qc.invalidateQueries({queryKey:["meal-favorites"]});
    }catch{toast.error("Couldn't update saved meals.");}
    finally{setFavoriteBusy(null);}
  }

  const source:Meal[]=tab==="mine"?picks.suggested:picks.recents;
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto max-h-[88dvh] max-w-xl border-border bg-background">
        <DrawerHeader className="text-left">
          <DrawerTitle className="font-display text-2xl font-normal">Meals you know by heart</DrawerTitle>
          <DrawerDescription>One tap adds a portion you have eaten before. Your partner has their own list.</DrawerDescription>
        </DrawerHeader>
        <div className="flex gap-5 border-b border-border px-5" role="tablist" aria-label="Quick meal categories">
          {(["mine","recent","saved"] as const).map(key=>(
            <button key={key} type="button" role="tab" aria-selected={tab===key}
              onClick={()=>setTab(key)}
              className={cn("min-h-11 border-b-2 text-sm font-medium capitalize",
                tab===key?"border-primary text-foreground":"border-transparent text-muted-foreground")}>
              {key==="mine"?"My meals":key==="recent"?"History":"Saved"}
            </button>
          ))}
        </div>
        <div className="min-h-40 space-y-0 overflow-y-auto px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          {tab==="saved" ? (
            favoritesPending ? <p className="py-7 text-sm text-muted-foreground">Loading saved meals…</p>
            : favoritesError ? <div className="py-6 text-sm">
                <p>Saved meals aren't available right now.</p>
                <Btn variant="outline" onClick={()=>void refetch()} className="mt-2">Retry</Btn>
              </div>
            : favorites.length===0 ? <p className="py-8 text-sm text-muted-foreground">
                Nothing saved yet. Open Recently eaten and save a meal you have often.
              </p>
            : favorites.map(f=>(
              <div key={f.id} className="flex items-center gap-3 border-b border-border/70 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{f.food_name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {f.serving_description?f.serving_description+" · ":""}{fmt(f.calories)} kcal · {fmt(f.protein)}g protein
                  </p>
                </div>
                <Btn variant="outline" disabled={Boolean(favoriteBusy)||Boolean(busyId)} onClick={()=>void logSaved(f)}>
                  {favoriteBusy===f.id?"Adding…":"Log"}
                </Btn>
              </div>
            ))
          ):source.length===0 ? <p className="py-8 text-sm text-muted-foreground">
            {tab==="mine"?"Log a meal once and it will be ready here next time.":"No meals found in recent history."}
          </p>:source.map(m=>{
            const regular=picks.usuals.find(u=>mealSignature(u.meal)===mealSignature(m));
            const marked=savedNames.has(m.food_name.trim().toLocaleLowerCase());
            return (
              <div key={m.id} className="flex items-center gap-2 border-b border-border/70 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{m.food_name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {m.serving_description?m.serving_description+" · ":""}{fmt(m.calories)} kcal · {fmt(Number(m.protein))}g protein
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {regular?`Logged ${regular.times} times · `:""}Last eaten {m.meal_date===today?"today":m.meal_date}
                  </p>
                </div>
                <button type="button" disabled={Boolean(favoriteBusy)||Boolean(busyId)}
                  aria-label={marked?`Remove ${m.food_name} from saved meals`:`Save ${m.food_name} for easy logging`}
                  className="flex size-11 shrink-0 items-center justify-center rounded-full text-primary focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={()=>void toggleSaved(m)}>
                  <span aria-hidden="true">{marked?"♥":"♡"}</span>
                </button>
                <Btn variant="outline" disabled={Boolean(busyId)||Boolean(favoriteBusy)}
                  onClick={()=>void onCopy(m)}>
                  {busyId===m.id?"Adding…":"Log"}
                </Btn>
              </div>
            );
          })}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
