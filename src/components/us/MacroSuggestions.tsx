import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { useQuery } from "@tanstack/react-query";
import { suggestMealsForMacros } from "@/lib/meal-operations.functions";
import { Btn } from "@/components/us/primitives";

export function MacroSuggestions({
  open,
  onOpenChange,
  remainingCalories,
  targetProtein,
  targetCarbs,
  targetFat,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  remainingCalories: number;
  targetProtein: number;
  targetCarbs: number;
  targetFat: number;
}) {
  const { data: suggestions = [] } = useQuery({
    queryKey: ["macro-suggestions", remainingCalories],
    queryFn: () => suggestMealsForMacros({ data: { remainingCalories, targetProtein, targetCarbs, targetFat } }),
    enabled: open,
  });

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>What Can I Eat?</DrawerTitle>
        </DrawerHeader>
        <div className="p-4 space-y-2">
          {suggestions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No suggestions</p>
          ) : (
            suggestions.map((s, i) => (
              <Btn key={i} variant="outline" className="w-full justify-between">
                <div className="flex-1 text-left">
                  <div className="text-sm font-medium">{s.name}</div>
                  <div className="text-xs text-muted-foreground">{s.calories} kcal · P{s.protein}g</div>
                </div>
                <div className="text-xs bg-primary/10 text-primary px-2 py-1 rounded">
                  {s.confidence}
                </div>
              </Btn>
            ))
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
