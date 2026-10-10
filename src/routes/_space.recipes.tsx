import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getMealTemplates, deleteMealTemplate, saveMealTemplate } from "@/lib/meal-operations.functions";
import { Btn, Screen, Eyebrow, TextInput } from "@/components/us/primitives";
import { toast } from "sonner";

export const Route = createFileRoute("/_space/recipes")({
  component: RecipesView,
});

function RecipesView() {
  const queryClient = useQueryClient();
  const [newRecipeName, setNewRecipeName] = useState("");
  const [createMode, setCreateMode] = useState(false);

  const { data: templates = [] } = useQuery({
    queryKey: ["meal-templates"],
    queryFn: () => getMealTemplates(),
  });

  const handleCreate = async () => {
    if (!newRecipeName.trim()) {
      toast.error("Recipe name required");
      return;
    }
    try {
      await saveMealTemplate({
        data: {
          name: newRecipeName,
          meals: [],
        },
      });
      queryClient.invalidateQueries({ queryKey: ["meal-templates"] });
      setNewRecipeName("");
      setCreateMode(false);
      toast.success("Recipe created");
    } catch (err) {
      toast.error("Failed to create recipe");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteMealTemplate({ data: { templateId: id } });
      queryClient.invalidateQueries({ queryKey: ["meal-templates"] });
      toast.success("Recipe deleted");
    } catch (err) {
      toast.error("Failed to delete recipe");
    }
  };

  return (
    <Screen>
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <Eyebrow>My Recipes</Eyebrow>
          <Btn onClick={() => setCreateMode(!createMode)}>
            <Plus className="w-4 h-4 mr-1" /> New
          </Btn>
        </div>

        {createMode && (
          <div className="p-3 bg-secondary rounded-lg space-y-2">
            <TextInput
              placeholder="Recipe name"
              value={newRecipeName}
              onChange={(e) => setNewRecipeName(e.target.value)}
            />
            <div className="flex gap-2">
              <Btn onClick={handleCreate} className="flex-1">
                Create
              </Btn>
              <Btn onClick={() => setCreateMode(false)} variant="outline" className="flex-1">
                Cancel
              </Btn>
            </div>
          </div>
        )}

        <div className="space-y-2">
          {templates.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground text-sm">
              <p>No recipes yet. Create one to start!</p>
            </div>
          ) : (
            templates.map((t) => (
              <div key={t.id} className="p-3 bg-secondary rounded-lg flex justify-between items-center">
                <div>
                  <div className="font-medium text-sm">{t.name}</div>
                  <div className="text-xs text-muted-foreground">{t.meals.length} meals</div>
                </div>
                <Btn variant="ghost" onClick={() => handleDelete(t.id)}>
                  <Trash2 className="w-4 h-4" />
                </Btn>
              </div>
            ))
          )}
        </div>
      </div>
    </Screen>
  );
}
