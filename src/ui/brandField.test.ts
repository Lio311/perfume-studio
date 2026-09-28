import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { tx } from "../i18n/copy.ts";
import { BrandTextField, brandHintText } from "./brandField.tsx";

describe("brand field hint", () => {
  it("shows the translated hint while the field is empty and hides it once the user types", () => {
    const he = tx("he").brandHint;
    const en = tx("en").brandHint;

    expect(he.startsWith("אין מותג עדיין")).toBe(true);
    expect(en.startsWith("No brand yet")).toBe(true);
    expect(brandHintText("", he)).toBe(he);
    expect(brandHintText("", en)).toBe(en);
    expect(brandHintText("בושם שלי 2026", he)).toBe("");
    expect(brandHintText("Atelier", en)).toBe("");

    const empty = renderToStaticMarkup(createElement(BrandTextField, { value: "", hint: he, label: "טקסט על הלוגו", onChange: () => undefined }));
    expect(empty).toContain(he);
    expect(empty).toContain("brand-hint");

    const typed = renderToStaticMarkup(createElement(BrandTextField, { value: "בושם שלי 2026", hint: he, label: "טקסט על הלוגו", onChange: () => undefined }));
    expect(typed).not.toContain(he);
    expect(typed).not.toContain("brand-hint");
    expect(typed).toContain("בושם שלי 2026");

    const emptyEn = renderToStaticMarkup(createElement(BrandTextField, { value: "", hint: en, label: "Logo text", onChange: () => undefined }));
    expect(emptyEn).toContain(en);

    const typedEn = renderToStaticMarkup(createElement(BrandTextField, { value: "Atelier", hint: en, label: "Logo text", onChange: () => undefined }));
    expect(typedEn).not.toContain(en);
    expect(typedEn).toContain("Atelier");
  });
});
