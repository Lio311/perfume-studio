// @vitest-environment happy-dom
import { createElement, type ReactNode } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { tx } from "../i18n/copy.ts";
import { syncRegistry, type SupplierPack } from "../import/registry.ts";
import { createDefaultDesign } from "../model/design.ts";
import { useLab } from "../store/labStore.ts";
import { BudgetMeter } from "./BudgetMeter.tsx";
import { PackWarningList } from "./PackWarnings.tsx";
import { PartPriceEditor, PriceTag } from "./PriceTag.tsx";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const pack: SupplierPack = {
  id: "moq-pack",
  name: "MOQ",
  createdAt: 1,
  parts: [{
    id: "moq-cap",
    kind: "cap",
    code: "MQ",
    name: "MOQ cap",
    neck: "FEA15",
    widthMm: 30,
    heightMm: 32,
    depthMm: 30,
    capacityMl: null,
    profile: "cylinder",
    color: "#c4a15a",
    thumb: "",
    page: 1,
    price: { value: 8, currency: "ILS", moq: 100 },
  }],
};

function visibleCap(id: string) {
  const design = createDefaultDesign();
  design.cap.visible = true;
  design.cap.variantId = id;
  return design;
}

function render(node: ReactNode): string {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(node);
  });
  const html = host.innerHTML;
  act(() => {
    root.unmount();
  });
  host.remove();
  return html;
}

describe("budget reading order and minimum-order hint", () => {
  afterEach(() => {
    syncRegistry([]);
    useLab.setState({
      lang: "he",
      brief: { ceilingIls: 30, volumeMl: 50, confirmed: false },
      priceOverrides: {},
      exchangeRates: {},
      design: createDefaultDesign(),
      suppliers: [],
    });
  });

  it("isolates the volume with its unit, and the rate amount, in bdi", () => {
    const t = tx("he");
    useLab.setState({
      lang: "he",
      brief: { ceilingIls: 200, volumeMl: 50, confirmed: true },
      design: visibleCap("cap-cyl-32"),
      priceOverrides: { "cap-cyl-32": { value: 4, currency: "USD" } },
      exchangeRates: {},
    });
    const meter = render(createElement(BudgetMeter, { onSavings: () => undefined }));
    expect(meter).toContain(`<bdi dir="ltr">50 ${t.capacityShort}</bdi>`);
    expect(meter).toContain(`${t.rateFor} <bdi dir="ltr">1 USD</bdi>`);

    const editor = render(createElement(PartPriceEditor, { kind: "cap", partId: "cap-cyl-32" }));
    expect(editor).toContain(`${t.rateFor} <bdi dir="ltr">1 USD</bdi>`);
  });

  it("shows a hint when the planned quantity is below a part minimum", () => {
    syncRegistry([pack]);
    useLab.setState({
      lang: "he",
      brief: { ceilingIls: 200, volumeMl: 50, confirmed: true, quantity: 10 },
      design: visibleCap("moq-cap"),
      priceOverrides: {},
      suppliers: [pack],
    });
    const t = tx("he");
    const meter = render(createElement(BudgetMeter, { onSavings: () => undefined }));
    expect(meter).toContain(t.belowMoq);

    useLab.setState({ brief: { ceilingIls: 200, volumeMl: 50, confirmed: true, quantity: 100 } });
    const met = render(createElement(BudgetMeter, { onSavings: () => undefined }));
    expect(met).not.toContain(t.belowMoq);

    useLab.setState({ lang: "en", brief: { ceilingIls: 200, volumeMl: 50, confirmed: true, quantity: 10 } });
    const tag = render(createElement(PriceTag, {
      price: { value: 8, currency: "ILS", source: "import", moq: 100, ils: 8, converted: false },
    }));
    expect(tag).toContain(tx("en").belowMoq);
  });

  it("shows an unknown supplier currency with its original value", () => {
    useLab.setState({ lang: "he", brief: { ceilingIls: 30, volumeMl: 50, confirmed: true } });
    const hebrew = render(createElement(PriceTag, {
      price: { value: 7, currency: "dollar", source: "import", ils: null, converted: false, unknownCurrency: true },
    }));
    expect(hebrew).toContain(`<bdi dir="ltr">7 ${tx("he").unknownCurrency}</bdi>`);
    expect(hebrew).not.toContain(tx("he").noPrice);

    useLab.setState({ lang: "en" });
    const english = render(createElement(PriceTag, {
      price: { value: 7.5, currency: "dollar", source: "import", ils: null, converted: false, unknownCurrency: true },
    }));
    expect(english).toContain(`<bdi dir="ltr">7.50 ${tx("en").unknownCurrency}</bdi>`);
  });

  it("isolates the part id at the start of a warning line", () => {
    const html = render(createElement(PackWarningList, {
      lines: [
        { partId: "qa-priced", text: "A tier was dropped." },
        { text: "+1 more" },
      ],
    }));
    expect(html).toContain('<bdi dir="ltr">qa-priced</bdi>: A tier was dropped.');
    expect(html).toContain("+1 more");
    expect(html).not.toContain("<bdi>+1 more</bdi>");
  });
});
