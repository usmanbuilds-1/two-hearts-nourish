import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Star } from "lucide-react";
import { toast } from "sonner";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Btn } from "./primitives";
import { emptyDraft, useSaveMeal } from "./MealSheet";
import { getFavoriteMeals, removeFavoriteMeal, saveFavoriteMeal, type MealFavorite } from "@/lib/meal-operations.functions";
import { fmt, defaultMealType, type Meal } from "@/lib/nutrition";
import { mealSignature, quickMealSuggestions } from "@/lib/quick-meals";
import { findSavedFood, isSavedPortion } from "@/lib/favorite-meals";
import { cn } from "@/lib/utils";

type Tab = "saved" | "recent";

export function QuickMealsSheet({
  open,onOpenChange,meals,memberId,today,onCopy,busyId
}:{
  open:boolean;onOpenChange:(open:boolean)=>void;meals:Meal[];memberId:string;today:string;
  onCopy:(meal:Meal)=>Promise<void>;busyId:string|null;
}) {
  const [tab,setTab]=useState<Tab>("saved");
  const [busy,setBusy]=useState<string|null>(null);
  const save=useSaveMeal();
  const qc=useQueryClient();
  useEffect(()=>{if(open)setTab("saved");},[open]);
  const {data:favorites=[],isPending,isError,refetch}=useQuery<MealFavorite[]>({
    queryKey:["meal-favorites",memberId],
    queryFn:()=>getFavoriteMeals(),
    enabled:open,
    refetchOnMount:"always",
  });

  const picks=useMemo(()=>quickMealSuggestions(meals,memberId,today),[meals,memberId,today]);
  const recent=useMemo(()=>{
    const seen=new Set<string>();
    return picks.recents.filter(m=>{
      const signature=mealSignature(m);
      if(seen.has(signature))return false;
      seen.add(signature);
      return true;
    });
  },[picks]);

  async function logSaved(m:MealFavorite) {
    if(busy||busyId)return;
    setBusy(m.id);
    try{
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
      toast.success(`${m.food_name} logged with your saved portion`);
      onOpenChange(false);
    }catch{toast.error("Couldn't log that meal. Try again.");}
    finally{setBusy(null);}
  }

  async function toggleSaved(meal:Meal) {
    if(busy||busyId||isPending||isError)return;
    const old=findSavedFood(favorites,meal);
    const same=isSavedPortion(old,meal);
    setBusy(meal.id);
    try {
      if(same&&old) {
        await removeFavoriteMeal({data:{foodName:old.food_name}});
        toast("Removed from favourites");
      }else{
        await saveFavoriteMeal({data:{
          foodName:old?.food_name??meal.food_name,
          servingDescription:meal.serving_description??"",
          calories:meal.calories,
          protein:Number(meal.protein),carbs:Number(meal.carbs),fat:Number(meal.fat),
        }});
        toast.success(old?"Saved portion updated":"Added to favourites");
      }
      await qc.invalidateQueries({queryKey:["meal-favorites",memberId]});
    }catch{toast.error("Couldn't update favourites.");}
    finally{setBusy(null);}
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto max-h-[88dvh] max-w-xl border-border bg-background">
        <DrawerHeader className="text-left">
          <DrawerTitle className="font-display text-2xl font-normal">Quick log</DrawerTitle>
          <DrawerDescription>Log a saved portion or save something from your recent meals. Only your meals appear here.</DrawerDescription>
        </DrawerHeader>
        <div className="flex border-b border-border px-5" role="group" aria-label="Quick meal categories">
          {(["saved","recent"] as const).map(key=>(
            <button key={key} type="button" aria-pressed={tab===key}
              onClick={()=>setTab(key)}
              className={cn("min-h-11 border-b-2 px-4 text-sm font-medium transition-colors",
                tab===key?"border-primary text-foreground":"border-transparent text-muted-foreground hover:text-foreground")}>
              {key==="saved"?`Favourites${favorites.length?` (${favorites.length})`:""}`:"Recent"}
            </button>
          ))}
        </div>
        <div className="min-h-40 space-y-0 overflow-y-auto px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          {tab==="saved" ? (
            isPending ? <p className="py-7 text-sm text-muted-foreground" role="status">Loading favourites…</p>
            : isError ? <div className="py-6 text-sm">
                <p>Couldn't load your favourites.</p>
                <Btn variant="outline" onClick={()=>void refetch()} className="mt-2">Retry</Btn>
              </div>
            : favorites.length===0 ? <div className="py-8">
                <p className="text-sm text-muted-foreground">No favourites saved yet. Star a meal in your diary or choose one from your recent meals.</p>
                <Btn variant="outline" className="mt-4" onClick={()=>setTab("recent")}>Browse recent meals</Btn>
              </div>
            : favorites.map(f=>(
              <div key={f.id} className="flex items-center gap-3 border-b border-border/70 py-3">
                <Star className="size-4 shrink-0 fill-primary text-primary" aria-hidden="true"/>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{f.food_name}</p>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {f.serving_description?f.serving_description+" · ":""}{fmt(f.calories)} kcal · {fmt(f.protein)}g protein
                  </p>
                </div>
                <Btn variant="outline" disabled={Boolean(busy)||Boolean(busyId)} onClick={()=>void logSaved(f)}>
                  {busy===f.id?"Adding…":"Log"}
                </Btn>
              </div>
            ))
          ):recent.length===0 ? <p className="py-8 text-sm text-muted-foreground">
            No recent meals yet. Once you've logged a meal, you can save it here.
          </p>:recent.map(m=>{
            const existing=findSavedFood(favorites,m);
            const marked=isSavedPortion(existing,m);
            return (
              <div key={m.id} className="flex items-center gap-2 border-b border-border/70 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{m.food_name}</p>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {m.serving_description?m.serving_description+" · ":""}{fmt(m.calories)} kcal · {fmt(Number(m.protein))}g protein
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">Eaten {m.meal_date===today?"today":m.meal_date}</p>
                </div>
                <button type="button" disabled={Boolean(busy)||Boolean(busyId)||isPending||isError}
                  aria-label={marked?`Remove ${m.food_name} from favourites`:existing?`Save this portion of ${m.food_name}`:`Save ${m.food_name} as a favourite`}
                  aria-pressed={marked}
                  className="flex size-11 shrink-0 items-center justify-center rounded-full text-primary focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                  onClick={()=>void toggleSaved(m)}>
                  <Star className={cn("size-[18px]",marked&&"fill-primary")} aria-hidden="true"/>
                </button>
                <Btn variant="outline" disabled={Boolean(busy)||Boolean(busyId)} onClick={()=>void onCopy(m)}>
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
