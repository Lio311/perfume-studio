import { afterEach, describe, expect, it } from "vitest";
import { BOTTLES } from "../model/bottles.ts";
import { setImportedCatalog, type ImportedCatalog } from "../model/catalog.ts";
import { CAPS } from "../model/caps.ts";
import { createDefaultDesign } from "../model/design.ts";
import { BOXES, COLLARS, PUMPS } from "../model/hardware.ts";
import { LOGOS } from "../model/logos.ts";
import type { FinishId, NeckId } from "../model/types.ts";
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
        supplier: { name: `Ver<e>scence`, ref: `A&B "1"` },
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
    expect(html).toContain("Ver&lt;e&gt;scence");
    expect(html).toContain("A&amp;B &quot;1&quot;");
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
    expect(html).not.toContain("&amp;");
  });
});
