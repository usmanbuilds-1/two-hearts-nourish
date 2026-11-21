import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { scaleMealPortion, resetPortionBasis, storedMealMacros, type PortionDraftLike } from "@/lib/meal-portion";
import { ScanPortionPicker } from "./ScanPortionPicker";

afterEach(cleanup);

const full: PortionDraftLike = {
  calories: "610", protein: "39", carbs: "67", fat: "20", portion_percentage: 100,
};

function PortionTest() {
  const [draft, setDraft] = useState(full);
  return (
    <div>
      <ScanPortionPicker
        percentage={draft.portion_percentage}
        fullCalories={draft.nominal_calories ?? 610}
        eatenCalories={Number(draft.calories)}
        onChange={percentage => setDraft(previous => scaleMealPortion(previous, percentage))}
      />
      <output aria-label="Nutrition">{JSON.stringify(storedMealMacros(draft))}</output>
    </div>
  );
}

describe("scanner portion eaten", () => {
  it("scales all nutrients immediately, using the full pictured portion each time", () => {
    render(<PortionTest />);
    fireEvent.click(screen.getByRole("button", { name: "50%" }));
    expect(screen.getByRole("button", { name: "50%" })).toHaveAttribute("aria-pressed", "true");
    expect(JSON.parse(screen.getByLabelText("Nutrition").textContent ?? "")).toEqual({
      calories: 305, protein: 19.5, carbs: 33.5, fat: 10,
    });
    fireEvent.click(screen.getByRole("button", { name: "25%" }));
    expect(JSON.parse(screen.getByLabelText("Nutrition").textContent ?? "")).toEqual({
      calories: 153, protein: 9.8, carbs: 16.8, fat: 5,
    });
    fireEvent.click(screen.getByRole("button", { name: "100%" }));
    expect(JSON.parse(screen.getByLabelText("Nutrition").textContent ?? "")).toEqual({
      calories: 610, protein: 39, carbs: 67, fat: 20,
    });
  });

  it("accepts valid custom percentages and ignores out-of-range entries", () => {
    render(<PortionTest />);
    fireEvent.click(screen.getByRole("button", { name: "Custom" }));
    const input = screen.getByRole("spinbutton", { name: /custom percentage/i });
    fireEvent.change(input, { target: { value: "60" } });
    expect(JSON.parse(screen.getByLabelText("Nutrition").textContent ?? "").calories).toBe(366);
    fireEvent.change(input, { target: { value: "150" } });
    expect(screen.getByRole("alert")).toHaveTextContent("1 to 100");
    expect(JSON.parse(screen.getByLabelText("Nutrition").textContent ?? "").calories).toBe(366);
  });

  it("preserves the eaten share when a new photo estimate or package source replaces full-plate macros", () => {
    const half = scaleMealPortion(full, 50);
    const revised = scaleMealPortion(resetPortionBasis({
      ...half, calories: "700", protein: "42", carbs: "75", fat: "24",
    }), half.portion_percentage);
    expect(storedMealMacros(revised)).toEqual({ calories: 350, protein: 21, carbs: 37.5, fat: 12 });
    expect(revised.nominal_calories).toBe(700);
    expect(revised.portion_percentage).toBe(50);
  });

  it("prevents editing the percentage while a meal photo is being saved", () => {
    const fn = () => {};
    render(<ScanPortionPicker percentage={50} fullCalories={610} eatenCalories={305} onChange={fn} disabled />);
    expect(screen.getByRole("button", { name: "25%" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Custom" })).toBeDisabled();
  });
});
