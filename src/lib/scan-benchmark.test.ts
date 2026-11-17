import { describe, expect, it } from "vitest";
import { summarizeBenchmark } from "./scan-benchmark";

describe("scanner benchmark metrics",()=>{
  it("separates directional bias from absolute percentage error",()=>{
    const summary=summarizeBenchmark([
      {mealId:"a",category:"simple",truth:{calories:500,protein:30,carbs:50,fat:20,grams:300},predicted:{calories:400,protein:25,carbs:45,fat:15,grams:270},latencyMs:2000,costMicrousd:1500},
      {mealId:"b",category:"mixed",truth:{calories:500,protein:30,carbs:50,fat:20,grams:300},predicted:{calories:600,protein:35,carbs:55,fat:25,grams:330},latencyMs:4000,costMicrousd:2500},
    ]);
    expect(summary.calorieMape).toBe(20);
    expect(summary.calorieBiasPct).toBe(0);
    expect(summary.calorieMae).toBe(100);
    expect(summary.gramMape).toBe(10);
    expect(summary.averageCostUsd).toBe(0.002);
  });

  it("measures same-meal repeat variation",()=>{
    const summary=summarizeBenchmark([
      {mealId:"same",category:"repeat",truth:{calories:500,protein:20,carbs:50,fat:20},predicted:{calories:450,protein:20,carbs:50,fat:20}},
      {mealId:"same",category:"repeat",truth:{calories:500,protein:20,carbs:50,fat:20},predicted:{calories:550,protein:20,carbs:50,fat:20}},
    ]);
    expect(summary.repeatVariationMedianPct).toBe(20);
  });
});
