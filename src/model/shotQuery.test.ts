import { describe, expect, it } from "vitest";
import { shotHeightMm, stripShotQuery } from "./shotQuery.ts";

describe("shot query", () => {
  it("drops shot keys and leaves voice", () => {
    const next = stripShotQuery("?closure=tube&voice=2&pose=open&theme=light");
    const params = new URLSearchParams(next);
    expect(params.get("voice")).toBe("2");
    expect(params.has("closure")).toBe(false);
    expect(params.has("pose")).toBe(false);
    expect(params.has("theme")).toBe(false);
  });

  it("treats an empty height as absent", () => {
    expect(shotHeightMm("")).toBeNull();
    expect(shotHeightMm(null)).toBeNull();
    expect(shotHeightMm("   ")).toBeNull();
    expect(shotHeightMm("nope")).toBeNull();
    expect(shotHeightMm("60")).toBe(60);
    expect(shotHeightMm("0")).toBe(48);
  });
});
