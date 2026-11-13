import { describe,expect,it } from "vitest";
import {friendlyDeviceLabel,shouldUpgradeDeviceLabel} from "./device-label";
describe("recognizable device labels",()=>{
  it("labels iPhone Safari accurately without inventing the model",()=>{
    expect(friendlyDeviceLabel("Mozilla iPhone Version/17 Safari/605")).toBe("iPhone · Safari");
  });
  it("names disclosed Android hardware models",()=>{
    expect(friendlyDeviceLabel("Mozilla/5.0 (Linux; Android 13; Infinix X6836 Build/TP1A; wv) AppleWebKit/537.36 Chrome/119.0"))
      .toBe("Infinix X6836 · Chrome");
    expect(friendlyDeviceLabel("Mozilla/5.0 (Linux; Android 12; Pixel 6 Build/SP2A) Chrome/122.0"))
      .toBe("Pixel 6 · Chrome");
  });
  it("does not store arbitrary user agent strings or fabricate a model",()=>{
    expect(friendlyDeviceLabel("unknown agent with a secret")).toBe("Browser");
    expect(friendlyDeviceLabel("Mozilla/5.0 (Linux; Android 13; K) Chrome/99")).toBe("Android · Chrome");
  });
  it("upgrades generic labels but leaves custom device names alone",()=>{
    expect(shouldUpgradeDeviceLabel("Android · Chrome","Infinix X6836 · Chrome")).toBe(true);
    expect(shouldUpgradeDeviceLabel("My bedroom phone","Infinix X6836 · Chrome")).toBe(false);
  });
});
