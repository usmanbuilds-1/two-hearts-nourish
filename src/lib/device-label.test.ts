import { describe,expect,it } from "vitest";
import {friendlyDeviceLabel} from "./device-label";
describe("device labels",()=>{
  it("labels Safari on iPhone",()=>expect(friendlyDeviceLabel("Mozilla iPhone Version/17 Safari/605")).toBe("iPhone · Safari"));
  it("does not use a raw user agent as a label",()=>expect(friendlyDeviceLabel("custom user agent with secret")).toBe("Browser"));
});
