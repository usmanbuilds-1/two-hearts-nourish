import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { useQuery } from "@tanstack/react-query";
import { getRecentMeals } from "@/lib/meal-operations.functions";
import { supabase } from "@/integrations/supabase/client";
import { useSpace } from "@/lib/space";
import { Btn } from "@/components/us/primitives";
import { toast } from "sonner";

export function RecentMealsSheet({
  open,
  onOpenChange,
  selectedDate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedDate: string;
}) {
  const { me, room, upsertLocal } = useSpace();

  const { data: meals = [] } = useQuery({
    queryKey: ["recent-meals"],
    queryFn: () => getRecentMeals(),
  });

  const handleAdd = async (meal: any) => {
    try {
      const { data, error } = await supabase
        .from("meals")
        .insert({
          room_id: room.id,
          member_id: me.id,
          meal_date: selectedDate,
          food_name: meal.food_name,
          calories: Math.round(meal.calories || 0),
          protein: Math.round((meal.protein || 0) * 10) / 10,
          carbs: Math.round((meal.carbs || 0) * 10) / 10,
          fat: Math.round((meal.fat || 0) * 10) / 10,
          meal_type: meal.meal_type || "lunch",
          serving_description: meal.serving_description,
        })
        .select()
        .single();

      if (error || !data) throw error;
      upsertLocal(data as any);
      toast.success(`Added "${meal.food_name}" to ${selectedDate}`);
      onOpenChange(false);
    } catch {
      toast.error("Failed to add meal");
    }
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto max-w-xl border-border bg-background">
        <DrawerHeader>
          <DrawerTitle className="font-display text-xl font-normal">Recent Meals</DrawerTitle>
          <DrawerDescription>Quick log a recently logged meal to {selectedDate}</DrawerDescription>
        </DrawerHeader>
        <div className="p-4 space-y-2 max-h-[60vh] overflow-y-auto">
          {meals.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No recent meals logged yet</p>
          ) : (
            meals.map((m) => (
              <Btn
                key={m.id}
                variant="outline"
                className="w-full justify-between h-auto py-3 px-4 text-left"
                onClick={() => handleAdd(m)}
              >
                <div className="flex-1 min-w-0 pr-2">
                  <div className="text-sm font-medium truncate">{m.food_name}</div>
                  <div className="text-xs text-muted-foreground">
                    {m.calories} kcal • P: {m.protein}g | C: {m.carbs}g | F: {m.fat}g
                  </div>
                </div>
                <div className="text-xs font-semibold uppercase px-2 py-0.5 rounded bg-secondary shrink-0">
                  {m.meal_type}
                </div>
              </Btn>
            ))
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
