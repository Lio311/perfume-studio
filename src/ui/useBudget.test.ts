// @vitest-environment happy-dom
import { createElement, act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { useBudgetModel } from "./useBudget.ts";
import { useLab } from "../store/labStore.ts";

describe("useBudgetModel", () => {
  let container: HTMLDivElement | null = null;
  afterEach(() => {
    if (container) {
      document.body.removeChild(container);
      container = null;
    }
  });

  function render(element: any) {
    container = document.createElement("div");
    document.body.appendChild(container);
    act(() => {
      createRoot(container!).render(element);
    });
  }

  it("flags over-budget only when the brief is confirmed", () => {
    useLab.getState().setBrief({ ceilingIls: 30 });
    
    let over = false;
    function TestComponent() {
      const model = useBudgetModel();
      over = model.summary.over;
      return null;
    }
    
    render(createElement(TestComponent));
    
    expect(over).toBe(false);
    
    act(() => {
      useLab.getState().confirmBrief();
    });
    
    expect(over).toBe(true);
  });
});
