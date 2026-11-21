import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Meal } from "@/lib/nutrition";
import { TodayMealRow } from "./TodayMealRow";

vi.mock("@/components/us/PrivateMealPhoto", () => ({
  PrivateMealPhoto: ({ stored }: { stored: string }) =>
    <img alt="" data-testid="actual-private-photo" data-storage-path={stored} />,
}));

const meal: Meal = {
  id: "meal-1", room_id: "room-1", member_id: "member-1",
  food_name: "Homemade chicken roll", calories: 430, protein: 24,
  carbs: 39, fat: 20, serving_description: null, ai_confidence: null,
  meal_type: "lunch", meal_date: "2026-11-21",
  created_at: "2026-11-21T10:00:00Z", updated_at: "2026-11-21T10:00:00Z",
};

afterEach(cleanup);

function row(overrides: Partial<Meal> = {}) {
  const onViewMeal = vi.fn();
  const onViewPhoto = vi.fn();
  const onToggleFavorite = vi.fn();
  render(<TodayMealRow meal={{ ...meal, ...overrides }} mealType="Lunch"
    owner="You" isMine roomId="room-1" marked={false}
    favoriteDisabled={false} onViewMeal={onViewMeal}
    onViewPhoto={onViewPhoto} onToggleFavorite={onToggleFavorite} />);
  return { onViewMeal, onViewPhoto, onToggleFavorite };
}

describe("Today meal cards", () => {
  it("uses the stored private image and retains distinct photo/detail/favourite actions", () => {
    const handlers = row({ photo_url: "room-1/real-food.webp" });
    expect(screen.getByTestId("actual-private-photo")).toHaveAttribute(
      "data-storage-path", "room-1/real-food.webp");
    fireEvent.click(screen.getByRole("button", { name: /view photo of homemade chicken roll/i }));
    fireEvent.click(screen.getByRole("button", { name: /open homemade chicken roll/i }));
    fireEvent.click(screen.getByRole("button", { name: /save portion of homemade chicken roll/i }));
    expect(handlers.onViewPhoto).toHaveBeenCalledTimes(1);
    expect(handlers.onViewMeal).toHaveBeenCalledTimes(1);
    expect(handlers.onToggleFavorite).toHaveBeenCalledTimes(1);
  });

  it("does not invent an image when no food photo was uploaded", () => {
    row({ photo_url: null });
    expect(screen.queryByTestId("actual-private-photo")).toBeNull();
    expect(screen.queryByRole("button", { name: /view photo/i })).toBeNull();
    expect(screen.getByText("Homemade chicken roll")).toBeInTheDocument();
  });

  it("marks planned food as not eaten", () => {
    row({ is_planned: true });
    expect(screen.getByText(/planned, not eaten/i)).toBeInTheDocument();
  });
});
