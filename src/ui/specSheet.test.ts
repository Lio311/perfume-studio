import { afterEach, describe, expect, it } from "vitest";
import { BOTTLES } from "../model/bottles.ts";
import { setImportedCatalog, type ImportedCatalog } from "../model/catalog.ts";
import { CAPS } from "../model/caps.ts";
import { createDefaultDesign } from "../model/design.ts";
import { BOXES, COLLARS, PUMPS } from "../model/hardware.ts";
import { LOGOS } from "../model/logos.ts";
import type { FinishId, NeckId } from "../model/types.ts";
import { renderedGlassOpacity } from "../model/materials.ts";
import { buildSpecHtml } from "./specSheet.ts";

const empty: ImportedCatalog = { bottles: [], caps: [], labels: [], pumps: [], collars: [], boxes: [] };

afterEach(() => {
  setImportedCatalog(empty);
});

describe("spec sheet HTML escaping", () => {
  it("escapes liquid colour, neck, supplier names, and other catalog text", () => {
    setImportedCatalog({
      bottles: [{
        ...BOTTLES[0],
        id: "xss-bottle",
        name: { he: `קארה <b>x</b>`, en: `Cara <b>x</b>` },
        supplier: { name: `O'Brien <e>`, ref: `A&B "1"` },
      }],
      caps: [{ ...CAPS[0], id: "xss-cap", name: { he: `פקק <i>`, en: `Cap <i>` } }],
      labels: [{ ...LOGOS[0], id: "xss-logo", name: { he: `לוגו <img>`, en: `Logo <img>` } }],
      pumps: [{ ...PUMPS[0], id: "xss-pump", name: { he: `משאבה <svg>`, en: `Pump <svg>` } }],
      collars: [{ ...COLLARS[0], id: "xss-collar", name: { he: `צווארון <script>`, en: `Collar <script>` } }],
      boxes: [{ ...BOXES[0], id: "xss-box", name: { he: `קופסה <q>`, en: `Box <q>` } }],
    });

    const design = createDefaultDesign();
    design.bottle.variantId = "xss-bottle";
    design.bottle.neck = `FEA15"><svg/onload=alert(1)>` as NeckId;
    design.cap.variantId = "xss-cap";
    design.cap.finish = `gold<script>` as FinishId;
    design.pump.variantId = "xss-pump";
    design.collar.variantId = "xss-collar";
    design.label.variantId = "xss-logo";
    design.label.text = `Nº <script>alert(1)</script>`;
    design.box.variantId = "xss-box";
    design.liquid.color = `#fff" onload="alert(1)`;

    const html = buildSpecHtml(design, "he", `data:image/png;base64,abc"><script>`);

    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<svg");
    expect(html).not.toContain("<b>");
    expect(html).not.toContain("<i>");
    expect(html).not.toContain("<q>");
    expect(html.match(/<img/g)).toEqual(["<img"]);
    expect(html).toContain("O&#39;Brien &lt;e&gt;");
    expect(html).toContain("A&amp;B &quot;1&quot;");
    expect(html).not.toContain("&amp;#39;");
    expect(html).toContain("FEA15&quot;&gt;&lt;svg/onload=alert(1)&gt;");
    expect(html).toContain("#fff&quot; onload=&quot;alert(1)");
    expect(html).toContain("קארה &lt;b&gt;x&lt;/b&gt;");
    expect(html).toContain("פקק &lt;i&gt;");
    expect(html).toContain("לוגו &lt;img&gt;");
    expect(html).toContain("משאבה &lt;svg&gt;");
    expect(html).toContain("צווארון &lt;script&gt;");
    expect(html).toContain("קופסה &lt;q&gt;");
    expect(html).toContain("gold&lt;script&gt;");
    expect(html).toContain("Nº &lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("src=\"data:image/png;base64,abc&quot;&gt;&lt;script&gt;\"");
    expect(html).not.toContain("&amp;amp;");
  });

  it("leaves a normal catalog spec readable", () => {
    const html = buildSpecHtml(createDefaultDesign(), "en", "data:image/png;base64,AAAA");
    expect(html).toContain("Verescence");
    expect(html).toContain("FEA15");
    expect(html).toContain("#c98a2b");
    expect(html).toContain("Supplier specification");
  });

  it("does not treat inherited keys as a neck", () => {
    for (const neck of ["constructor", "__proto__"] as const) {
      const design = createDefaultDesign();
      design.bottle.neck = neck as NeckId;
      const html = buildSpecHtml(design, "en", "data:image/png;base64,AAAA");
      expect(html).toContain(`${neck} · EN 14849`);
      for (const label of ["Cap", "Pump", "Collar", "Box", "Ferrule ID / OD / height"]) {
        const cell = html.match(new RegExp(`<th>${label}</th><td>(.*?)</td>`));
        expect(cell?.[1], `${neck} ${label}`).toContain("—");
        expect(cell?.[1], `${neck} ${label}`).not.toContain("0.0");
      }
    }
  });

  it("prints an em dash instead of zero sizes when the neck is unknown", () => {
    const design = createDefaultDesign();
    design.bottle.neck = "FEA15<img>" as NeckId;
    const html = buildSpecHtml(design, "en", "data:image/png;base64,AAAA");
    for (const label of ["Cap", "Pump", "Collar", "Box", "Ferrule ID / OD / height"]) {
      const cell = html.match(new RegExp(`<th>${label}</th><td>(.*?)</td>`));
      expect(cell?.[1], label).toContain("—");
      expect(cell?.[1], label).not.toContain("0.0");
    }
    expect(html).toContain("67.6");
  });

  it("lists bottle glass colour, finish, and opacity separately from the liquid", () => {
    const design = createDefaultDesign();
    design.bottle.finish = "tinted";
    design.bottle.color = "#112233";
    design.bottle.opacity = 0.1;
    design.liquid.color = "#abcdef";
    design.liquid.fill = 0.5;
    const html = buildSpecHtml(design, "en", "data:image/png;base64,AAAA");
    const glass = html.match(/<th>Glass<\/th><td>(.*?)<\/td>/);
    const liquid = html.match(/<th>Liquid<\/th><td>(.*?)<\/td>/);
    const rendered = renderedGlassOpacity("tinted", 0.1);
    expect(rendered).toBeCloseTo(0.15 + 0.85 * 0.1);
    expect(glass?.[1]).toBe(`Tinted · #112233 · ${Math.round((rendered ?? 0) * 100)}%`);
    expect(liquid?.[1]).toBe("50% · #abcdef");
  });

  it("prints the mapped alpha for frosted and tinted glass at 0, 50, and 100", () => {
    for (const finish of ["frosted", "tinted"] as const) {
      for (const opacity of [0, 0.5, 1]) {
        const design = createDefaultDesign();
        design.bottle.finish = finish;
        design.bottle.color = "#112233";
        design.bottle.opacity = opacity;
        const html = buildSpecHtml(design, "en", "data:image/png;base64,AAAA");
        const rendered = renderedGlassOpacity(finish, opacity);
        expect(rendered).toBeCloseTo(0.15 + 0.85 * opacity);
        const name = finish === "frosted" ? "Frosted" : "Tinted";
        expect(html.match(/<th>Glass<\/th><td>(.*?)<\/td>/)?.[1]).toBe(
          `${name} · #112233 · ${Math.round((rendered ?? 0) * 100)}%`,
        );
      }
    }
  });

  it("uses the shared clear-glass default and skips opacity on metal or opaque finishes", () => {
    const clear = buildSpecHtml(createDefaultDesign(), "en", "data:image/png;base64,AAAA");
    expect(clear.match(/<th>Glass<\/th><td>(.*?)<\/td>/)?.[1]).toBe("Clear glass · #f3efe6 · 14%");

    const gold = createDefaultDesign();
    gold.bottle.finish = "gold";
    gold.bottle.color = "#d4b48a";
    gold.bottle.opacity = 0.4;
    const goldHtml = buildSpecHtml(gold, "en", "data:image/png;base64,AAAA");
    expect(goldHtml.match(/<th>Glass<\/th><td>(.*?)<\/td>/)?.[1]).toBe("Gold · #d4b48a");

    const solid = createDefaultDesign();
    solid.bottle.finish = "matteBlack";
    solid.bottle.color = "#141414";
    solid.bottle.opacity = 0.2;
    const solidHtml = buildSpecHtml(solid, "en", "data:image/png;base64,AAAA");
    expect(solidHtml.match(/<th>Glass<\/th><td>(.*?)<\/td>/)?.[1]).toBe("Matte black · #141414");
  });
});
