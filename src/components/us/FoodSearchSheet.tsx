import { useState } from "react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Btn, TextInput } from "@/components/us/primitives";
import { Loader2 } from "lucide-react";

export function FoodSearchSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Search Foods</DrawerTitle>
        </DrawerHeader>
        <div className="p-4 space-y-3">
          <TextInput
            placeholder="Search Open Food Facts..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <Btn disabled={loading} className="w-full">
            {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Search
          </Btn>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
