import { describe, expect, it } from "vitest";
import { wizardTitle } from "./copy.ts";

describe("wizardTitle", () => {
  it("names step 2 after the bottle colour, opacity, and fill controls", () => {
    expect(wizardTitle("he", 1)).toBe("שלב 2: צבע הבקבוק, שקיפות ומילוי");
    expect(wizardTitle("en", 1)).toBe("Step 2: Bottle Color, Opacity & Fill");
    expect(wizardTitle("en", 1)).toContain("Color");
  });

  it("reads the other step names from the translation table", () => {
    expect(wizardTitle("he", 0)).toBe("שלב 1: בחירת בקבוק");
    expect(wizardTitle("en", 2)).toBe("Step 3: Choose a Pump");
    expect(wizardTitle("he", 6)).toBe("שלב 7: בחירת אריזה");
    expect(wizardTitle("en", 99)).toBe("");
  });
});
