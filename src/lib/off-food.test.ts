import {describe,it,expect} from "vitest";
import {normalizeOffProduct} from "./off-food";
const raw={code:"3017620422003",product_name:"Hazelnut spread",brands:"Example",nutriments:{"energy-kcal_100g":539,"proteins_100g":6.3,"carbohydrates_100g":57.5,"fat_100g":30.9}};
describe("community food records",()=>{
  it("uses exact per-100g label values, not fabricated AI estimates",()=>{
    expect(normalizeOffProduct(raw)).toMatchObject({name:"Hazelnut spread",calories:539,protein:6.3,carbs:57.5,fat:30.9});
  });
  it("refuses incomplete and implausible records",()=>{
    expect(normalizeOffProduct({...raw,nutriments:{"energy-kcal_100g":539}})).toBeNull();
    expect(normalizeOffProduct({...raw,nutriments:{...raw.nutriments,fat_100g:-1}})).toBeNull();
  });
  it("supports energy provided in kJ",()=>{
    const copy={...raw,nutriments:{...raw.nutriments,"energy-kcal_100g":undefined,"energy-kj_100g":418.4}};
    expect(normalizeOffProduct(copy)?.calories).toBe(100);
  });
});
