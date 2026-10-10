# Prompt 4: Update Navigation

Update `src/routes/_space.tsx` to add the new diary, recipes, planner, and analytics tabs.

Replace the current navigation object with this:

```typescript
// In src/routes/_space.tsx, find the NAV array and replace it with:

import { LayoutGrid, UtensilsCrossed, Calendar as CalendarIcon, BarChart3 } from "lucide-react";

const NAV = [
  { to: "/diary", label: "Diary", icon: LayoutGrid },
  { to: "/recipes", label: "Recipes", icon: UtensilsCrossed },
  { to: "/planner", label: "Planner", icon: CalendarIcon },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/settings", label: "Settings", icon: Settings },
];
```

Update the grid columns from `grid-cols-4` to `grid-cols-5` to accommodate 5 tabs.

Update the nav label font size to `text-[11px]` for smaller screens.

That's it. The rest of the route structure stays the same.
