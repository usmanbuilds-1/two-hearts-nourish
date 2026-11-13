import { describe,expect,it } from "vitest";
import {parseSpaceLink,spaceLinkToPath} from "./space-link";
const origin="https://two-hearts.example";
const secret="a".repeat(64);
describe("private entry link parsing",()=>{
  it("accepts a room code with or without dash",()=>{
    expect(parseSpaceLink("ABCD-2345",origin)).toEqual({code:"ABCD-2345",token:null});
    expect(parseSpaceLink("abcd2345",origin)).toEqual({code:"ABCD-2345",token:null});
  });
  it("accepts only same-origin private rejoin links",()=>{
    const parsed=parseSpaceLink(origin+"/r/ABCD-2345#rejoin="+secret,origin);
    expect(parsed).toEqual({code:"ABCD-2345",token:secret});
    expect(spaceLinkToPath(parsed!)).toBe("/r/ABCD-2345#rejoin="+secret);
  });
  it("rejects external and malformed sign-in links",()=>{
    expect(parseSpaceLink("https://evil.example/r/ABCD-2345#rejoin="+secret,origin)).toBeNull();
    expect(parseSpaceLink(origin+"/r/ABCD-2345?rejoin="+secret,origin)).toBeNull();
    expect(parseSpaceLink(origin+"/r/ABCD-2345#rejoin=123456",origin)).toBeNull();
    expect(parseSpaceLink("javascript:alert(1)",origin)).toBeNull();
    expect(parseSpaceLink(origin+"/fake/r/ABCD-2345",origin)).toBeNull();
  });
});
