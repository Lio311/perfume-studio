/** @vitest-environment happy-dom */
import { afterEach, describe, expect, it, vi } from "vitest";

async function freshSplash() {
  vi.resetModules();
  return import("./splash.ts");
}

describe("studio splash", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("stays up until both the app and the first scene frame are ready", async () => {
    document.body.innerHTML = '<div id="studio-splash" class="studio-splash"></div>';
    const splash = document.getElementById("studio-splash")!;
    const { noteAppMounted, noteStudioFrame } = await freshSplash();
    noteAppMounted();
    expect(document.getElementById("studio-splash")).toBe(splash);
    expect(splash.classList.contains("is-out")).toBe(false);
    sessionStorage.setItem("perfume-lab-preload-reloaded", "1");
    noteStudioFrame();
    expect(sessionStorage.getItem("perfume-lab-preload-reloaded")).toBeNull();
    expect(splash.classList.contains("is-out")).toBe(true);
    splash.dispatchEvent(new Event("transitionend"));
    expect(document.getElementById("studio-splash")).toBeNull();
  });

  it("does not fade on mount alone", async () => {
    document.body.innerHTML = '<div id="studio-splash" class="studio-splash"></div>';
    const { noteAppMounted } = await freshSplash();
    noteAppMounted();
    expect(document.getElementById("studio-splash")?.classList.contains("is-out")).toBe(false);
  });
});
