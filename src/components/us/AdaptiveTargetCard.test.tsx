import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdaptiveTargetCard } from "./AdaptiveTargetCard";

const mocks = vi.hoisted(() => ({
  status: {
    enabled: true,
    configurationReady: true,
    yesterdayComplete: false,
    latestUnseenChange: null as null,
  },
  changeDay: vi.fn(),
  invalidate: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({
    isPending: false,
    isError: false,
    data: mocks.status,
    refetch: vi.fn(),
  }),
  useQueryClient: () => ({ invalidateQueries: mocks.invalidate }),
}));
vi.mock("@/lib/space", () => ({
  useSpace: () => ({
    me: { id: "member-a" },
    today: "2026-11-21",
    setMember: vi.fn(),
  }),
}));
vi.mock("@/lib/adaptive-target.functions", () => ({
  getAdaptiveTargetStatus: vi.fn(),
  markNutritionDayComplete: mocks.changeDay,
  acknowledgeAdaptiveTargetChange: vi.fn(),
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

beforeEach(() => {
  mocks.status.enabled = true;
  mocks.status.configurationReady = true;
  mocks.status.yesterdayComplete = false;
  mocks.status.latestUnseenChange = null;
  mocks.changeDay.mockReset();
  mocks.changeDay.mockResolvedValue({ ok: true, change: null });
  mocks.invalidate.mockClear();
});
afterEach(cleanup);

describe("adaptive day completion UI", () => {
  it("shows one compact action on Today when yesterday has not been confirmed", () => {
    render(<AdaptiveTargetCard location="today" />);
    expect(screen.getByText("Finished logging yesterday?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm" })).toBeInTheDocument();
    expect(screen.queryByText("Adaptive target evidence")).not.toBeInTheDocument();
  });

  it("does not repeat the completed-day card after confirmation", () => {
    mocks.status.yesterdayComplete = true;
    const { container } = render(<AdaptiveTargetCard location="today" />);
    expect(container.firstChild).toBeNull();
  });

  it("keeps yesterday's undo action available in Settings and never silently changes a target", async () => {
    mocks.status.yesterdayComplete = true;
    render(<AdaptiveTargetCard location="settings" />);
    expect(screen.getByText(/marked fully logged/i)).toBeInTheDocument();
    expect(screen.getByText(/does not reverse a calorie-target adjustment/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Undo confirmation" }));
    await waitFor(() => expect(mocks.changeDay).toHaveBeenCalledWith({
      data: { logDate: "2026-11-20", clientDate: "2026-11-21", complete: false },
    }));
    expect(mocks.invalidate).toHaveBeenCalled();
  });

  it("keeps setup explanations off Today when adaptive targets aren't configured", () => {
    mocks.status.configurationReady = false;
    const { container } = render(<AdaptiveTargetCard location="today" />);
    expect(container.firstChild).toBeNull();
  });
});
