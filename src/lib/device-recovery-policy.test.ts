import {describe,expect,it} from "vitest";
import {recoveryBinding} from "./device-recovery-policy";
describe("device-specific recovery",()=>{
  it("reuses an existing device slot instead of creating a phantom row",()=>{
    expect(recoveryBinding(null,"member-a","device-a")).toBe("rebind");
  });
  it("registers a new device only for legacy unbound keys",()=>{
    expect(recoveryBinding(null,"member-a",null)).toBe("register");
  });
  it("does not duplicate the current mapped device",()=>{
    expect(recoveryBinding("member-a","member-a","device-a")).toBe("existing");
  });
  it("prevents recovery into someone else's membership",()=>{
    expect(()=>recoveryBinding("member-b","member-a","device-a")).toThrow("ALREADY_IN_SPACE");
  });
});
