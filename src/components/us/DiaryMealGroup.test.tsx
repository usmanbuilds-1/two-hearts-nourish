import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DiaryMealGroup } from "./DiaryMealGroup";
import type { Meal } from "@/lib/nutrition";

afterEach(cleanup);

const example = {
  id:"meal-a", room_id:"room-a", member_id:"member-a",
  food_name:"Milk tea", calories:120, protein:6, carbs:12, fat:5,
  serving_description:"1 cup", ai_confidence:null,
  meal_date:"2026-11-21", meal_type:"breakfast", created_at:"",updated_at:"",
} as Meal;

function GroupTest({ entries = [example] }: { entries?: Meal[] }) {
  const [expanded,setExpanded] = useState(true);
  const [edit,setEdit] = useState<string | null>(null);
  const [options,setOptions] = useState<string | null>(null);
  return (
    <>
      <DiaryMealGroup type="breakfast" label="Breakfast" entries={entries}
        expanded={expanded} onToggle={() => setExpanded(prev => !prev)}
        onAdd={vi.fn()} onEdit={meal => setEdit(meal.id)}
        onOptions={meal => setOptions(meal.id)} />
      <output data-testid="edit">{edit}</output>
      <output data-testid="options">{options}</output>
    </>
  );
}

describe("Diary meal groups", () => {
  it("shows real meal values with edit and options actions", () => {
    render(<GroupTest />);
    expect(screen.getByText("Breakfast")).toBeInTheDocument();
    expect(screen.getByText("Milk tea")).toBeInTheDocument();
    expect(screen.getAllByText(/120/).length).toBeGreaterThanOrEqual(1);
    fireEvent.click(screen.getByRole("button", {name: "Options for Milk tea"}));
    expect(screen.getByTestId("options")).toHaveTextContent("meal-a");
    fireEvent.click(screen.getByRole("button", {name: "Edit Milk tea"}));
    expect(screen.getByTestId("edit")).toHaveTextContent("meal-a");
  });

  it("marks planned meals separately and excludes them from the heading total", () => {
    render(<GroupTest entries={[example, { ...example, id:"planned", calories:900, is_planned:true, food_name:"Future breakfast" }]} />);
    expect(screen.getByText("Planned · not eaten")).toBeInTheDocument();
    expect(screen.getByText("Future breakfast")).toBeInTheDocument();
    expect(screen.getByText("2 items")).toBeInTheDocument();
    const heading = screen.getByRole("button", {name:/Breakfast/});
    expect(heading).toHaveAttribute("aria-expanded", "true");
    expect(screen.getAllByText(/120/).length).toBeGreaterThanOrEqual(1);
  });

  it("allows groups to collapse without deleting any meal", () => {
    render(<GroupTest />);
    const control = screen.getByRole("button", {name:/Breakfast/});
    fireEvent.click(control);
    expect(control).toHaveAttribute("aria-expanded", "false");
    expect(document.getElementById("diary-group-breakfast")).toHaveAttribute("hidden");
    fireEvent.click(control);
    expect(control).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Milk tea")).toBeInTheDocument();
  });
});
