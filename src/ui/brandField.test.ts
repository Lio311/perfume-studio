import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";
import { tx } from "../i18n/copy.ts";
import { createDefaultDesign } from "../model/design.ts";
import { useLab } from "../store/labStore.ts";
import { BrandTextField, brandHintParts, brandHintText, labelVisibleAfterTextChange } from "./brandField.tsx";

beforeEach(() => {
  useLab.setState({ design: createDefaultDesign(), past: [], future: [] });
});

const he = tx("he").brandHint;
const en = tx("en").brandHint;

function fieldMarkup(value: string, hint = he, labelId = "brand-heading") {
  return renderToStaticMarkup(createElement(BrandTextField, { value, hint, labelId, onChange: () => undefined }));
}

describe("brand field hint", () => {
  it("shows a one-line overlay while empty and keeps the full hint for screen readers", () => {
    expect(he.startsWith("אין מותג עדיין")).toBe(true);
    expect(en.startsWith("No brand yet")).toBe(true);
    expect(brandHintParts(he)).toEqual({ line: "אין מותג עדיין", more: "מה שתקלידו יופיע על הסימון." });
    expect(brandHintParts(en)).toEqual({ line: "No brand yet", more: "Whatever you type is drawn on the mark." });
    expect(brandHintText("", he)).toBe(he);
    expect(brandHintText("", en)).toBe(en);
    expect(brandHintText("בושם שלי 2026", he)).toBe("");
    expect(brandHintText("Atelier", en)).toBe("");
    expect(brandHintText("   ", he)).toBe("");

    const empty = fieldMarkup("");
    const describedBy = empty.match(/aria-describedby="([^"]+)"/)?.[1];
    expect(describedBy).toBeTruthy();
    expect(empty).toContain(`id="${describedBy}"`);
    expect(empty).toContain('aria-labelledby="brand-heading"');
    expect(empty).not.toContain("aria-label=");
    expect(empty).toContain('class="brand-hint"');
    expect(empty).toContain('aria-hidden="true"');
    expect(empty).toContain("brand-hint-sr");
    expect(empty).toContain("brand-hint-more");
    expect(empty.split(he).length - 1).toBe(1);
    expect(empty).toContain("אין מותג עדיין");
    expect(empty).toContain("מה שתקלידו יופיע על הסימון.");
    expect(empty).not.toContain("placeholder");

    const typed = fieldMarkup("בושם שלי 2026");
    expect(typed).not.toContain('class="brand-hint"');
    expect(typed).toContain("brand-hint-sr");
    expect(typed).toContain(he);
    expect(typed).toContain('aria-describedby="');
    expect(typed).toContain("בושם שלי 2026");
    expect(typed).not.toContain("aria-label=");

    const emptyEn = fieldMarkup("", en, "logo-heading");
    expect(emptyEn).toContain("No brand yet");
    expect(emptyEn).toContain("Whatever you type is drawn on the mark.");
    expect(emptyEn).toContain('aria-labelledby="logo-heading"');
    expect(emptyEn.split(en).length - 1).toBe(1);

    const typedEn = fieldMarkup("Atelier", en);
    expect(typedEn).not.toContain('class="brand-hint"');
    expect(typedEn).toContain(en);
    expect(typedEn).toContain("Atelier");
  });

  it("turns the label on when text is entered and keeps the previous visibility when cleared", () => {
    expect(labelVisibleAfterTextChange("בושם", false)).toBe(true);
    expect(labelVisibleAfterTextChange(" ", false)).toBe(true);
    expect(labelVisibleAfterTextChange("", false)).toBe(false);
    expect(labelVisibleAfterTextChange("", true)).toBe(true);

    useLab.setState({ design: createDefaultDesign(), past: [], future: [] });
    const type = (text: string) => {
      const visible = labelVisibleAfterTextChange(text, useLab.getState().design.label.visible);
      useLab.getState().patch("label", { text, visible });
    };

    expect(useLab.getState().design.label.visible).toBe(false);
    type("");
    expect(useLab.getState().design.label.visible).toBe(false);
    expect(useLab.getState().design.label.text).toBe("");

    type("   ");
    expect(useLab.getState().design.label.text).toBe("   ");
    expect(useLab.getState().design.label.visible).toBe(true);
    expect(fieldMarkup(useLab.getState().design.label.text)).not.toContain('class="brand-hint"');

    type("בושם שלי 2026");
    expect(useLab.getState().design.label.visible).toBe(true);

    type("");
    expect(useLab.getState().design.label.text).toBe("");
    expect(useLab.getState().design.label.visible).toBe(true);
    expect(fieldMarkup("")).toContain('class="brand-hint"');

    useLab.setState({
      design: { ...createDefaultDesign(), label: { ...createDefaultDesign().label, text: "NOIR", visible: false } },
      past: [],
      future: [],
    });
    type("");
    expect(useLab.getState().design.label.text).toBe("");
    expect(useLab.getState().design.label.visible).toBe(false);
  });

  it("follows text written by chat, undo, and a shared design", () => {
    useLab.setState({ design: createDefaultDesign(), past: [], future: [] });
    expect(brandHintText(useLab.getState().design.label.text, he)).toBe(he);
    expect(fieldMarkup(useLab.getState().design.label.text)).toContain('class="brand-hint"');

    useLab.getState().applyCommands([{ type: "text", text: "NOIR" }]);
    expect(useLab.getState().design.label.text).toBe("NOIR");
    expect(useLab.getState().design.label.visible).toBe(false);
    expect(brandHintText(useLab.getState().design.label.text, he)).toBe("");
    expect(fieldMarkup(useLab.getState().design.label.text)).not.toContain('class="brand-hint"');

    useLab.getState().undo();
    expect(useLab.getState().design.label.text).toBe("");
    expect(brandHintText(useLab.getState().design.label.text, he)).toBe(he);
    expect(fieldMarkup(useLab.getState().design.label.text)).toContain('class="brand-hint"');

    const shared = createDefaultDesign();
    shared.label = { ...shared.label, text: "Atelier", visible: true };
    useLab.getState().restoreDesign(shared);
    expect(useLab.getState().design.label.text).toBe("Atelier");
    expect(useLab.getState().design.label.visible).toBe(true);
    expect(fieldMarkup(useLab.getState().design.label.text)).not.toContain('class="brand-hint"');

    const cleared = createDefaultDesign();
    useLab.getState().restoreDesign(cleared);
    expect(useLab.getState().design.label.text).toBe("");
    expect(fieldMarkup(useLab.getState().design.label.text)).toContain('class="brand-hint"');
  });
});
