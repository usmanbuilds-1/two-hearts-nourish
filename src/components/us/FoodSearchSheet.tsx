import { useState } from "react";
import { toast } from "sonner";
import { Drawer,DrawerContent,DrawerHeader,DrawerTitle,DrawerDescription } from "@/components/ui/drawer";
import { Btn,TextInput } from "./primitives";
import { BarcodeScanner } from "./BarcodeScanner";
import { searchPackagedFoods } from "@/lib/food-catalog.functions";
import type { PackagedFood } from "@/lib/off-food";

export function FoodSearchSheet({
  open,onOpenChange,onSelect
}:{
  open:boolean;
  onOpenChange:(open:boolean)=>void;
  onSelect:(food:PackagedFood,amount:number)=>void;
}) {
  const [mode,setMode]=useState<"name"|"barcode">("name");
  const [query,setQuery]=useState("");
  const [grams,setGrams]=useState("100");
  const [foods,setFoods]=useState<PackagedFood[]>([]);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const amount=Number(grams);

  async function search(){
    if(query.trim().length<2)return;
    setLoading(true);
    setError("");
    setFoods([]);
    try {
      const r=await searchPackagedFoods({data:{query:query.trim()}});
      if(!r.ok) {
        setError(r.error==="NOT_FOUND"?"No matching packaged foods with complete nutrition labels."
          :r.error==="RATE_LIMIT"?"Search limit reached. Try again in a minute."
          :"Food database unavailable. Try again or enter values manually.");
      } else setFoods(r.foods);
    } catch {
      setError("Couldn't reach the food database.");
    } finally {setLoading(false);}
  }
  function choose(food:PackagedFood,gramsValue:number){
    onSelect(food,gramsValue);
    onOpenChange(false);
    toast.success("Label values added. Check the portion before saving.");
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto max-h-[85dvh] max-w-xl border-border bg-background">
        <DrawerHeader>
          <DrawerTitle>Find packaged food</DrawerTitle>
          <DrawerDescription>Open Food Facts community labels. Check the package before logging.</DrawerDescription>
        </DrawerHeader>
        <div className="space-y-3 overflow-y-auto px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <div className="grid grid-cols-2 gap-2">
            <Btn variant={mode==="name"?"default":"outline"} onClick={()=>setMode("name")}>Search name</Btn>
            <Btn variant={mode==="barcode"?"default":"outline"} onClick={()=>setMode("barcode")}>Barcode</Btn>
          </div>
          {mode==="barcode"?(
            <BarcodeScanner onSelect={choose}/>
          ):(
            <>
              <form className="flex gap-2" onSubmit={e=>{e.preventDefault();void search();}}>
                <TextInput value={query} onChange={e=>setQuery(e.target.value)}
                  placeholder="Search packaged foods" className="min-w-0 flex-1" maxLength={80}/>
                <Btn disabled={loading||query.trim().length<2}>{loading?"Finding…":"Search"}</Btn>
              </form>
              {error&&<p role="status" className="text-sm text-muted-foreground">{error}</p>}
              {foods.length>0&&(
                <>
                  <label className="block text-sm">Amount eaten, in g/ml
                    <TextInput type="number" inputMode="decimal" min={1} max={2000}
                      value={grams} onChange={e=>setGrams(e.target.value)}/>
                  </label>
                  <div className="space-y-1.5">
                    {foods.map(food=>(
                      <button key={food.code} type="button"
                        disabled={!Number.isFinite(amount)||amount<=0||amount>2000}
                        onClick={()=>choose(food,amount)}
                        className="w-full rounded-xl border border-border px-3 py-3 text-left disabled:opacity-40">
                        <span className="block text-sm font-medium">{food.name}{food.brand?" · "+food.brand:""}</span>
                        <span className="mt-1 block text-xs text-muted-foreground">
                          Per 100g/ml: {food.calories} kcal · P {food.protein}g · C {food.carbs}g · F {food.fat}g
                        </span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
          <p className="text-xs text-muted-foreground">Community data may be outdated or incomplete. No nutrition values are invented for missing labels.</p>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
