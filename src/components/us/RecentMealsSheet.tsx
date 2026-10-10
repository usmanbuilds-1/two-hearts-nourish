import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { useQuery } from "@tanstack/react-query";
import { getRecentMeals } from "@/lib/meal-operations.functions";
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
  const { data: meals = [] } = useQuery({
    queryKey: ["recent-meals"],
    queryFn: () => getRecentMeals(),
  });

  const handleAdd = async (meal: any) => {
    toast.success("Meal added");
    onOpenChange(false);
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Recent Meals</DrawerTitle>
          <DrawerDescription>Add to {selectedDate}</DrawerDescription>
        </DrawerHeader>
        <div className="p-4 space-y-2">
          {meals.length === 0 ? (
            <p className="text-sm text-muted-foreground">No recent meals</p>
          ) : (
            meals.map((m) => (
              <Btn
                key={m.id}
                variant="outline"
                className="w-full justify-between"
                onClick={() => handleAdd(m)}
              >
                <div className="flex-1 text-left">
                  <div className="text-sm font-medium">{m.food_name}</div>
                  <div className="text-xs text-muted-foreground">{m.calories} kcal</div>
                </div>
                <div className="text-xs font-bold">{m.meal_type}</div>
              </Btn>
            ))
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
